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
 * Funkcja odpytująca bazę – czeka aż dla danego pytania (questionId) udzielona zostanie odpowiedź przez drugiego partnera.
 */
function pollForOtherAnswer(token, questionId, partner, callback) {
  function poll() {
    loadQuizRow(token).then(row => {
      if (row) {
        const otherAnswers = partner === "1" ? row.partner2_answers : row.partner1_answers;
        if (otherAnswers && otherAnswers[questionId] !== undefined) {
          callback();
        } else {
          setTimeout(poll, 1000);
        }
      } else {
        setTimeout(poll, 1000);
      }
    });
  }
  poll();
}

/**
 * Funkcja synchronizująca pytania – na bieżąco określa numer aktualnego pytania
 * jako liczbę pytań, na które oboje partnerzy udzielili odpowiedzi.
 */
function showCurrentQuestion(token, sessionData, partner, appDiv, onQuizCompleted) {
  loadQuizRow(token).then(row => {
    const answers1 = row.partner1_answers || {};
    const answers2 = row.partner2_answers || {};
    // Liczba pytań, na które oboje udzielili odpowiedzi:
    const commonAnswersCount = Object.keys(answers1).filter(key => answers2[key] !== undefined).length;
    const quizQuestions = sessionData.quizQuestions;
    if (commonAnswersCount >= quizQuestions.length) {
      // Quiz zakończony
      computeAndShowResults(token, appDiv);
      return;
    }
    const currentQuestion = quizQuestions[commonAnswersCount];
    const p1 = sessionData.partner1Name;
    const p2 = sessionData.partner2Name;
    const formattedQuestion = formatText(currentQuestion.text, p1, p2);
    const questionWithCategory = `<span class="category-label">Kategoria: ${currentQuestion.category}</span><br />${formattedQuestion}`;
    let optionsHTML = "";
    if (currentQuestion.type === "comparative") {
      optionsHTML = `
        <div class="tile" data-answer="1">${p1}</div>
        <div class="tile" data-answer="2">${p2}</div>
      `;
    } else if (currentQuestion.type === "yesno") {
      optionsHTML = `
        <div class="tile" data-answer="tak">Tak</div>
        <div class="tile" data-answer="nie">Nie</div>
      `;
    }
    // Wyświetlamy bieżące pytanie:
    showQuestion(appDiv, commonAnswersCount, quizQuestions.length, questionWithCategory, optionsHTML, (answer) => {
      // Aktualizujemy odpowiedź lokalnie i w bazie
      if (partner === "1") {
        const updatedAnswers = { ...answers1, [currentQuestion.id]: { category: currentQuestion.category, type: currentQuestion.type, answer: answer } };
        upsertQuizRow(token, sessionData, updatedAnswers, answers2).then(() => {
          appDiv.innerHTML = `<p>Czekaj na odpowiedź od <strong>${p2}</strong>...</p>`;
          pollForOtherAnswer(token, currentQuestion.id, partner, () => {
            // Po otrzymaniu odpowiedzi drugiego gracza, pokazujemy kolejne pytanie
            showCurrentQuestion(token, sessionData, partner, appDiv, onQuizCompleted);
          });
        });
      } else {
        const updatedAnswers = { ...answers2, [currentQuestion.id]: { category: currentQuestion.category, type: currentQuestion.type, answer: answer } };
        upsertQuizRow(token, sessionData, answers1, updatedAnswers).then(() => {
          appDiv.innerHTML = `<p>Czekaj na odpowiedź od <strong>${p1}</strong>...</p>`;
          pollForOtherAnswer(token, currentQuestion.id, partner, () => {
            showCurrentQuestion(token, sessionData, partner, appDiv, onQuizCompleted);
          });
        });
      }
    });
  });
}

/**
 * Rozpoczęcie quizu – ustawia pytania i uruchamia funkcję synchronizującą
 */
export function startQuiz(token, sessionData, partner, appDiv, onQuizCompleted) {
  // Przygotowanie listy pytań (wybrane kategorie lub pełny zestaw)
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
  // Zapisujemy w bazie konfigurację quizu (jeśli jeszcze nie była zapisana)
  loadQuizRow(token).then(existingRow => {
    const existingSessionData = existingRow?.session_data || {};
    const p1Answers = existingRow?.partner1_answers || {};
    const p2Answers = existingRow?.partner2_answers || {};
    const newSessionData = { ...existingSessionData, ...sessionData };
    upsertQuizRow(token, newSessionData, p1Answers, p2Answers).then(() => {
      // Rozpoczynamy wyświetlanie bieżącego pytania
      showCurrentQuestion(token, newSessionData, partner, appDiv, onQuizCompleted);
    });
  });
}

/**
 * Funkcja wywoływana po zakończeniu quizu – wyświetla wyniki.
 */
export async function computeAndShowResults(token, appDiv) {
  // Obliczamy wspólne odpowiedzi i wyświetlamy wyniki (pozostaje bez zmian)
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
  if (Object.keys(answers1).length !== quizQuestions.length || Object.keys(answers2).length !== quizQuestions.length) {
    appDiv.innerHTML = `<p>Oczekiwanie na zakończenie quizu przez oboje partnerów...</p>`;
    setTimeout(() => computeAndShowResults(token, appDiv), 1000);
    return;
  }
  let total = quizQuestions.length;
  let agreements = 0;
  const detailsHTML = quizQuestions.map(q => {
    const questionText = formatText(q.text, p1, p2);
    const a1 = answers1[q.id]?.answer;
    const a2 = answers2[q.id]?.answer;
    const answer1 = a1 === "1" ? p1 : a1 === "2" ? p2 : a1;
    const answer2 = a2 === "1" ? p1 : a2 === "2" ? p2 : a2;
    const isMatch = (a1 === a2);
    if (isMatch) agreements++;
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
  const overallAgreement = ((agreements / total) * 100).toFixed(2);
  showQuizResults(appDiv, p1, p2, overallAgreement, detailsHTML, () => {
    window.location.href = window.location.origin + window.location.pathname;
  });
}
