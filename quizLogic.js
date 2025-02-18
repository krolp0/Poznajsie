import { loadQuizRow, upsertQuizRow } from "./database.js";
import { fullQuizData } from "./quizData.js";
import { showQuestion, showQuizResults } from "./ui.js";

/**
 * Zastępuje {p1} i {p2} w tekście nazwami partnerów.
 */
function formatText(text, p1, p2) {
  return text.replace(/{p1}/g, p1).replace(/{p2}/g, p2);
}

/**
 * Funkcja, która synchronizuje przebieg quizu.
 * Oblicza bieżący indeks pytania jako minimum liczby odpowiedzi udzielonych przez obu graczy.
 * Jeśli obecny partner jeszcze nie odpowiedział na bieżące pytanie – wyświetla je z opcjami odpowiedzi.
 * W przeciwnym razie – wyświetla komunikat oczekiwania.
 */
function syncAndShowQuestion(quizQuestions, token, sessionData, partner, appDiv, onQuizCompleted) {
  loadQuizRow(token).then(row => {
    const p1Answers = row.partner1_answers || {};
    const p2Answers = row.partner2_answers || {};
    // Bieżący indeks to minimum liczby odpowiedzi udzielonych przez obu graczy
    const count1 = Object.keys(p1Answers).length;
    const count2 = Object.keys(p2Answers).length;
    const currentIndex = Math.min(count1, count2);
    
    if (currentIndex >= quizQuestions.length) {
      // Quiz ukończony – przejdź do wyników
      computeAndShowResults(token, appDiv);
      return;
    }
    
    const currentQuestion = quizQuestions[currentIndex];
    // Sprawdzamy, czy obecny partner już odpowiedział na bieżące pytanie
    const currentAnswer = (partner === "1" ? p1Answers : p2Answers)[currentQuestion.id];
    if (currentAnswer === undefined) {
      // Partner jeszcze nie odpowiedział – wyświetlamy pytanie z opcjami
      const p1 = sessionData.partner1Name;
      const p2 = sessionData.partner2Name;
      const questionText = formatText(currentQuestion.text, p1, p2);
      const questionWithCategory = `<span class="category-label">Kategoria: ${currentQuestion.category}</span><br />${questionText}`;
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
      showQuestion(appDiv, currentIndex, quizQuestions.length, questionWithCategory, optionsHTML, (answer) => {
        // Po wybraniu odpowiedzi zapisujemy ją do bazy
        loadQuizRow(token).then(latestRow => {
          const updatedP1 = latestRow.partner1_answers || {};
          const updatedP2 = latestRow.partner2_answers || {};
          if (partner === "1") {
            updatedP1[currentQuestion.id] = { category: currentQuestion.category, type: currentQuestion.type, answer: answer };
          } else {
            updatedP2[currentQuestion.id] = { category: currentQuestion.category, type: currentQuestion.type, answer: answer };
          }
          upsertQuizRow(token, sessionData, updatedP1, updatedP2).then(() => {
            // Po zapisaniu, uruchamiamy polling, aby sprawdzić, czy drugi partner odpowiedział.
            pollForSync(quizQuestions, token, sessionData, partner, appDiv, currentIndex, onQuizCompleted);
          });
        });
      });
    } else {
      // Obecny partner już odpowiedział – czekamy na odpowiedź drugiego
      pollForSync(quizQuestions, token, sessionData, partner, appDiv, currentIndex, onQuizCompleted);
    }
  });
}

/**
 * Funkcja pollingowa – odpytuje bazę co sekundę, aż oboje partnerzy udzielą odpowiedzi na bieżące pytanie.
 * Gdy to nastąpi, przechodzi do wyświetlenia kolejnego pytania.
 */
function pollForSync(quizQuestions, token, sessionData, partner, appDiv, currentIndex, onQuizCompleted) {
  loadQuizRow(token).then(row => {
    const p1Answers = row.partner1_answers || {};
    const p2Answers = row.partner2_answers || {};
    const count1 = Object.keys(p1Answers).length;
    const count2 = Object.keys(p2Answers).length;
    const minCount = Math.min(count1, count2);
    if (minCount > currentIndex) {
      // Obydwoje odpowiedzieli – przechodzimy do kolejnego pytania
      syncAndShowQuestion(quizQuestions, token, sessionData, partner, appDiv, onQuizCompleted);
    } else {
      // Określ, który partner jeszcze nie odpowiedział
      let waitingFor = "";
      if (count1 <= currentIndex) waitingFor += sessionData.partner1Name;
      if (count2 <= currentIndex) waitingFor += (waitingFor ? " oraz " : "") + sessionData.partner2Name;
      appDiv.innerHTML = `<p>Czekaj na odpowiedź od <strong>${waitingFor}</strong>...</p>`;
      setTimeout(() => {
        pollForSync(quizQuestions, token, sessionData, partner, appDiv, currentIndex, onQuizCompleted);
      }, 1000);
    }
  });
}

/**
 * Funkcja inicjująca quiz w trybie synchronicznym.
 * Tworzy listę pytań na podstawie wybranych kategorii i uruchamia pierwszy etap synchronizacji.
 */
export function startSyncQuiz(token, sessionData, partner, appDiv, onQuizCompleted) {
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
  // Rozpoczynamy synchronizację od pierwszego pytania (indeks 0)
  syncAndShowQuestion(quizQuestions, token, sessionData, partner, appDiv, onQuizCompleted);
}

/**
 * Funkcja obliczająca i wyświetlająca wyniki – pozostaje bez zmian.
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
