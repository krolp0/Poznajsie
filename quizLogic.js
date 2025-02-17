import { loadQuizRow, upsertQuizRow } from "./database.js";
import { fullQuizData } from "./quizData.js";
import { showQuestion, showQuizResults } from "./ui.js";

function formatText(text, p1, p2) {
  return text.replace(/{p1}/g, p1).replace(/{p2}/g, p2);
}

export function startQuiz(token, sessionData, partner, appDiv, onQuizCompleted) {
  // Budujemy listę pytań na podstawie wybranych kategorii lub używamy pełnego zestawu
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
  // Aktualizujemy sessionData w bazie
  loadQuizRow(token).then(existingRow => {
    const existingSessionData = existingRow?.session_data || {};
    const p1Answers = existingRow?.partner1_answers || {};
    const p2Answers = existingRow?.partner2_answers || {};
    const newSessionData = { ...existingSessionData, ...sessionData };
    upsertQuizRow(token, newSessionData, p1Answers, p2Answers).then(() => {
      let localAnswers = {};
      showNextQuestion(0, quizQuestions, token, newSessionData, partner, appDiv, localAnswers, onQuizCompleted);
    });
  });
}

function showNextQuestion(index, quizQuestions, token, sessionData, partner, appDiv, localAnswers, onQuizCompleted) {
  if (index >= quizQuestions.length) {
    // Po zakończeniu quizu zapisujemy odpowiedzi
    saveFinalAnswers(token, sessionData, partner, localAnswers).then(() => {
      onQuizCompleted();
    });
    return;
  }
  const total = quizQuestions.length;
  const current = quizQuestions[index];
  const p1 = sessionData.partner1Name;
  const p2 = sessionData.partner2Name;
  const questionText = formatText(current.text, p1, p2);
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
  showQuestion(appDiv, index, total, questionText, optionsHTML, (answer) => {
    localAnswers[current.id] = {
      category: current.category,
      type: current.type,
      answer: answer
    };
    setTimeout(() => {
      showNextQuestion(index + 1, quizQuestions, token, sessionData, partner, appDiv, localAnswers, onQuizCompleted);
    }, 300);
  });
}

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

export function computeAndShowResults(token, appDiv) {
  loadQuizRow(token).then(row => {
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
    if (Object.keys(answers1).length !== quizQuestions.length ||
        Object.keys(answers2).length !== quizQuestions.length) {
      appDiv.innerHTML = `<p>Oczekiwanie na zakończenie quizu przez oboje partnerów...</p>`;
      setTimeout(() => computeAndShowResults(token, appDiv), 1000);
      return;
    }
    let total = quizQuestions.length;
    let agreements = 0;
    let detailsHTML = quizQuestions.map(q => {
      const questionText = formatText(q.text, p1, p2);
      const a1 = answers1[q.id]?.answer;
      const a2 = answers2[q.id]?.answer;
      const answer1 = (a1 === "1") ? p1 : (a1 === "2") ? p2 : a1;
      const answer2 = (a2 === "1") ? p1 : (a2 === "2") ? p2 : a2;
      if (a1 === a2) agreements++;
      return `
        <li>
          <strong>${q.category}:</strong> ${questionText}<br />
          <em>Partner 1:</em> ${answer1}<br />
          <em>Partner 2:</em> ${answer2}
        </li>
      `;
    }).join("");
    const overallAgreement = ((agreements / total) * 100).toFixed(2);
    showQuizResults(appDiv, p1, p2, overallAgreement, detailsHTML, () => {
      window.location.href = window.location.origin + window.location.pathname;
    });
  });
}
