import { loadQuizRow, upsertQuizRow } from "./database.js";
import { fullQuizData } from "./quizData.js";
import { showQuestion, showQuizResults } from "./ui.js";

/**
 * Zastępuje {p1} i {p2} w tekście nazwami partnerów
 */
function formatText(text, p1, p2) {
  return text.replace(/{p1}/g, p1).replace(/{p2}/g, p2);
}

/**
 * Rozpoczęcie quizu dla danego partnera.
 * @param {string} token – identyfikator quizu
 * @param {object} sessionData – obiekt z danymi quizu (imiona, wybrane kategorie, itp.)
 * @param {string} partner – "1" lub "2"
 * @param {HTMLElement} appDiv – główny kontener w index.html
 * @param {function} onQuizCompleted – wywoływane po zakończeniu quizu
 */
export function startQuiz(token, sessionData, partner, appDiv, onQuizCompleted) {
  // Budujemy listę pytań (wybrane kategorie lub wszystkie)
  let quizQuestions = [];
  const cats = sessionData.selectedCategories && sessionData.selectedCategories.length > 0
    ? sessionData.selectedCategories
    : fullQuizData;
  cats.forEach(cat => {
    cat.questions.forEach(q => {
      quizQuestions.push({ ...q, category: cat.category });
    });
  });
  sessionData.quizQuestions = quizQuestions;

  // Pobieramy z bazy istniejące dane i zapisujemy quizQuestions w session_data
  loadQuizRow(token).then(existingRow => {
    const existingSessionData = existingRow?.session_data || {};
    const p1Answers = existingRow?.partner1_answers || {};
    const p2Answers = existingRow?.partner2_answers || {};

    // Scal metadane
    const newSessionData = { ...existingSessionData, ...sessionData };
    upsertQuizRow(token, newSessionData, p1Answers, p2Answers).then(() => {
      // Lokalne odpowiedzi partnera
      let localAnswers = {};
      showNextQuestion(
        0,
        quizQuestions,
        token,
        newSessionData,
        partner,
        appDiv,
        localAnswers,
        onQuizCompleted
      );
    });
  });
}

/**
 * Rekurencyjne przechodzenie przez pytania
 */
function showNextQuestion(
  index,
  quizQuestions,
  token,
  sessionData,
  partner,
  appDiv,
  localAnswers,
  onQuizCompleted
) {
  // Gdy wyczerpaliśmy pytania – zapisujemy odpowiedzi
  if (index >= quizQuestions.length) {
    saveFinalAnswers(token, sessionData, partner, localAnswers).then(() => {
      onQuizCompleted();
    });
    return;
  }

  const total = quizQuestions.length;
  const current = quizQuestions[index];
  const p1 = sessionData.partner1Name;
  const p2 = sessionData.partner2Name;

  // Formatowanie treści pytania z użyciem imion
  const questionText = formatText(current.text, p1, p2);
  // Dodajemy nazwę kategorii w treści pytania
  const questionWithCategory = `
    <span class="category-label">Kategoria: ${current.category}</span><br />
    ${questionText}
  `;

  // Przygotowanie opcji odpowiedzi
  let optionsHTML = "";
  if (current.type === "comparative") {
    optionsHTML = `
      <div class="tile" data-answer="1">${p1}</div>
      <div class="tile" data-answer="2">${p2}</div>
    `;
  } else if (current.type === "yesno") {
    optionsHTML = `
      <div class="tile" data-answer="tak">Tak</div>
      <div class="tile" data-answer="nie">Nie</div>
    `;
  }

  // Wyświetlenie pytania i obsługa kliknięcia
  showQuestion(appDiv, index, total, questionWithCategory, optionsHTML, (answer) => {
    // Zapisanie odpowiedzi lokalnie
    localAnswers[current.id] = {
      category: current.category,
      type: current.type,
      answer: answer
    };
    // Przechodzimy do kolejnego pytania
    setTimeout(() => {
      showNextQuestion(
        index + 1,
        quizQuestions,
        token,
        sessionData,
        partner,
        appDiv,
        localAnswers,
        onQuizCompleted
      );
    }, 300);
  });
}

/**
 * Zapisanie odpowiedzi partnera w bazie
 */
async function saveFinalAnswers(token, sessionData, partner, localAnswers) {
  const row = await loadQuizRow(token);
  if (!row) {
    console.error("Nie znaleziono quizu w bazie przy zapisywaniu odpowiedzi.");
    return;
  }
  const finalSessionData = row.session_data || {};
  const p1Answers = row.partner1_answers || {};
  const p2Answers = row.partner2_answers || {};

  if (partner === "1") {
    const merged1 = { ...p1Answers, ...localAnswers };
    await upsertQuizRow(token, finalSessionData, merged1, p2Answers);
  } else {
    const merged2 = { ...p2Answers, ...localAnswers };
    await upsertQuizRow(token, finalSessionData, p1Answers, merged2);
  }
}

/**
 * Wyświetlenie wyników quizu
 */
export async function computeAndShowResults(token, appDiv) {
  const row = await loadQuizRow(token);
  if (!row) {
    appDiv.innerHTML = "<p>Błąd: Nie można załadować quizu z bazy.</p>";
    return;
  }

  const sessionData = row.session_data || {};
  const answers1 = row.partner1_answers || {};
  const answers2 = row.partner2_answers || {};
  const p1 = sessionData.partner1Name || "Partner1";
  const p2 = sessionData.partner2Name || "Partner2";
  const quizQuestions = sessionData.quizQuestions || [];

  // Sprawdzenie, czy oboje partnerzy udzielili odpowiedzi na wszystkie pytania
  if (
    Object.keys(answers1).length !== quizQuestions.length ||
    Object.keys(answers2).length !== quizQuestions.length
  ) {
    appDiv.innerHTML = `<p>Oczekiwanie na zakończenie quizu przez oboje partnerów...</p>`;
    setTimeout(() => computeAndShowResults(token, appDiv), 1000);
    return;
  }

  let total = quizQuestions.length;
  let agreements = 0;

  // Generujemy listę pytań + odpowiedzi
  const detailsHTML = quizQuestions.map(q => {
    const questionText = formatText(q.text, p1, p2);

    // surowe odpowiedzi: "1" / "2" (comparative) lub "tak"/"nie" (yesno)
    const a1 = answers1[q.id]?.answer;
    const a2 = answers2[q.id]?.answer;

    // tłumaczymy "1" i "2" na imiona
    const answer1 = (a1 === "1") ? p1 : (a1 === "2") ? p2 : a1;
    const answer2 = (a2 === "1") ? p1 : (a2 === "2") ? p2 : a2;

    // czy odpowiedzi są zgodne?
    const isMatch = (a1 === a2);
    if (isMatch) agreements++;

    // klasa CSS do wyróżnienia zgodnych/niezgodnych odpowiedzi
    const colorClass = isMatch ? "match-answer" : "mismatch-answer";

    return `
      <li class="${colorClass}">
        <strong>Kategoria: ${q.category}</strong><br />
        <span class="question-text">${questionText}</span><br />
        <em>${p1}:</em> ${answer1}<br />
        <em>${p2}:</em> ${answer2}
      </li>
    `;
  }).join("");

  // Procent zgodności
  const overallAgreement = ((agreements / total) * 100).toFixed(2);

  // Wyświetlamy wyniki
  showQuizResults(appDiv, p1, p2, overallAgreement, detailsHTML, () => {
    window.location.href = window.location.origin + window.location.pathname;
  });
}
