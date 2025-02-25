import { loadQuizRow, upsertQuizRow } from "./database.js";
import { fullQuizData } from "./quizData.js";
import { showQuestion, showQuizResults, showWaitingScreen } from "./ui.js";

/**
 * Zamienia {p1} i {p2} na imiona partnerów.
 */
function formatText(text, p1, p2) {
  return text.replace(/{p1}/g, p1).replace(/{p2}/g, p2);
}

/**
 * Inicjuje quiz w trybie synchronicznym.
 * Buduje listę pytań oraz uruchamia funkcję synchronizującą.
 */
export function startSyncQuiz(token, sessionData, partner, appDiv, onQuizCompleted) {
  console.log("startSyncQuiz rozpoczęty dla partnera:", partner);
  // Sprawdzamy, czy mamy już zapisane pytania
  let quizQuestions = sessionData.quizQuestions || [];
  
  // Jeśli nie mamy pytań, budujemy je
  if (quizQuestions.length === 0) {
    console.log("Budowanie listy pytań...");
    const cats = (sessionData.selectedCategories && sessionData.selectedCategories.length > 0)
      ? sessionData.selectedCategories
      : fullQuizData;
    
    cats.forEach(cat => {
      cat.questions.forEach(q => {
        quizQuestions.push({ ...q, category: cat.category });
      });
    });
    
    // Zapisujemy pytania w sesji, żeby nie tworzyć ich ponownie
    sessionData.quizQuestions = quizQuestions;
    upsertQuizRow(token, sessionData, {}, {}).then(() => {
      console.log("Pytania zapisane w bazie, rozpoczynam quiz");
      syncQuiz(quizQuestions, token, sessionData, partner, appDiv, onQuizCompleted);
    }).catch(err => {
      console.error("Błąd przy zapisywaniu pytań:", err);
      appDiv.innerHTML = "<p>Błąd przy inicjalizacji quizu. Odśwież stronę i spróbuj ponownie.</p>";
    });
  } else {
    console.log("Pytania już istnieją, rozpoczynam quiz");
    syncQuiz(quizQuestions, token, sessionData, partner, appDiv, onQuizCompleted);
  }
}

/**
 * Główna funkcja synchronizująca – oblicza bieżący indeks pytania jako minimum liczby odpowiedzi obu graczy.
 * Jeśli na danym urządzeniu dany gracz jeszcze nie odpowiedział, wyświetla pytanie z opcjami.
 * Jeśli już odpowiedział, ale drugi jeszcze nie – wyświetla komunikat oczekiwania.
 * Gdy oboje udzielą odpowiedzi, przechodzi do kolejnego pytania.
 */
function syncQuiz(quizQuestions, token, sessionData, partner, appDiv, onQuizCompleted) {
  console.log("syncQuiz wywołany");
  loadQuizRow(token).then(row => {
    if (!row) {
      appDiv.innerHTML = "<p>Błąd: Nie można załadować quizu z bazy. <button id='retryBtn'>Spróbuj ponownie</button></p>";
      document.getElementById("retryBtn").addEventListener("click", () => {
        syncQuiz(quizQuestions, token, sessionData, partner, appDiv, onQuizCompleted);
      });
      return;
    }
    
    const p1Answers = row.partner1_answers || {};
    const p2Answers = row.partner2_answers || {};
    const count1 = Object.keys(p1Answers).length;
    const count2 = Object.keys(p2Answers).length;
    const currentIndex = Math.min(count1, count2);

    console.log(`Partner ${partner}: P1 odpowiedzi: ${count1}, P2 odpowiedzi: ${count2}, Bieżący indeks: ${currentIndex}`);

    // Jeśli quiz ukończony, przechodzimy do wyników
    if (currentIndex >= quizQuestions.length) {
      console.log("Quiz ukończony, pokazuję wyniki");
      if (typeof onQuizCompleted === "function") {
        onQuizCompleted();
      } else {
        computeAndShowResults(token, appDiv);
      }
      return;
    }

    const currentQuestion = quizQuestions[currentIndex];
    const currentPlayerAnswers = (partner === "1") ? p1Answers : p2Answers;
    const otherPlayerAnswers = (partner === "1") ? p2Answers : p1Answers;

    // Jeśli dany gracz jeszcze nie odpowiedział na bieżące pytanie – wyświetlamy pytanie.
    if (currentPlayerAnswers[currentQuestion.id] === undefined) {
      console.log(`Partner ${partner} potrzebuje odpowiedzieć na pytanie: ${currentQuestion.id}`);
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
        // Pokazujemy ekran ładowania, aby uniknąć podwójnego kliknięcia
        appDiv.innerHTML = '<p>Zapisywanie odpowiedzi...</p>';
        
        // Po wybraniu odpowiedzi zapisujemy ją do bazy
        loadQuizRow(token).then(latestRow => {
          const updatedP1 = latestRow.partner1_answers || {};
          const updatedP2 = latestRow.partner2_answers || {};
          
          if (partner === "1") {
            updatedP1[currentQuestion.id] = { 
              category: currentQuestion.category, 
              type: currentQuestion.type, 
              answer: answer 
            };
          } else {
            updatedP2[currentQuestion.id] = { 
              category: currentQuestion.category, 
              type: currentQuestion.type, 
              answer: answer 
            };
          }
          
          upsertQuizRow(token, sessionData, updatedP1, updatedP2).then(() => {
            console.log(`Partner ${partner} zapisał odpowiedź na pytanie: ${currentQuestion.id}`);
            // Po zapisaniu odpowiedzi, uruchamiamy polling synchronizacyjny
            pollForSync(quizQuestions, token, sessionData, partner, appDiv, currentIndex, onQuizCompleted);
          }).catch(err => {
            console.error("Błąd przy zapisywaniu odpowiedzi:", err);
            appDiv.innerHTML = `
              <p>Błąd przy zapisywaniu odpowiedzi. <button id='retryBtn'>Spróbuj ponownie</button></p>
            `;
            document.getElementById("retryBtn").addEventListener("click", () => {
              syncQuiz(quizQuestions, token, sessionData, partner, appDiv, onQuizCompleted);
            });
          });
        }).catch(err => {
          console.error("Błąd przy pobieraniu quizu:", err);
          appDiv.innerHTML = `
            <p>Błąd przy pobieraniu quizu. <button id='retryBtn'>Spróbuj ponownie</button></p>
          `;
          document.getElementById("retryBtn").addEventListener("click", () => {
            syncQuiz(quizQuestions, token, sessionData, partner, appDiv, onQuizCompleted);
          });
        });
      });
    } else {
      // Dany gracz już odpowiedział – jeśli drugi nie, pokaż komunikat oczekiwania.
      if (otherPlayerAnswers[currentQuestion.id] === undefined) {
        console.log(`Partner ${partner} czeka na odpowiedź drugiego partnera`);
        const waitingFor = (partner === "1") ? sessionData.partner2Name : sessionData.partner1Name;
        showWaitingScreen(appDiv, waitingFor);
        pollForSync(quizQuestions, token, sessionData, partner, appDiv, currentIndex, onQuizCompleted);
      } else {
        // Obaj udzielili odpowiedzi – przechodzimy do kolejnego pytania.
        console.log("Obaj partnerzy odpowiedzieli, przechodzimy do kolejnego pytania");
        setTimeout(() => {
          syncQuiz(quizQuestions, token, sessionData, partner, appDiv, onQuizCompleted);
        }, 500);
      }
    }
  }).catch(err => {
    console.error("Błąd przy synchronizacji quizu:", err);
    appDiv.innerHTML = `
      <p>Błąd przy synchronizacji quizu. <button id='retryBtn'>Spróbuj ponownie</button></p>
    `;
    document.getElementById("retryBtn").addEventListener("click", () => {
      syncQuiz(quizQuestions, token, sessionData, partner, appDiv, onQuizCompleted);
    });
  });
}

// Zmienne do kontroli pollingu
let pollTimeoutId = null;
let pollCount = 0;
const MAX_POLL_TIME = 300000; // 5 minut maksymalnego oczekiwania
const POLL_INTERVAL = 1000; // 1 sekunda między zapytaniami

/**
 * Funkcja pollingowa – odpytuje bazę co sekundę, aż druga strona udzieli odpowiedzi na bieżące pytanie.
 * Dodana obsługa timeout w przypadku zbyt długiego oczekiwania.
 */
function pollForSync(quizQuestions, token, sessionData, partner, appDiv, currentIndex, onQuizCompleted) {
  console.log("pollForSync rozpoczęty");
  // Jeśli mamy aktywny polling, anulujemy go
  if (pollTimeoutId) {
    clearTimeout(pollTimeoutId);
  }
  
  // Inkrementujemy licznik pollingu
  pollCount++;
  
  // Sprawdzamy, czy nie przekroczyliśmy maksymalnego czasu oczekiwania
  if ((pollCount * POLL_INTERVAL) > MAX_POLL_TIME) {
    appDiv.innerHTML = `
      <p>Przekroczono maksymalny czas oczekiwania na odpowiedź partnera.</p>
      <button id='retryBtn'>Kontynuuj czekanie</button>
      <button id='resetBtn'>Wróć do strony głównej</button>
    `;
    document.getElementById("retryBtn").addEventListener("click", () => {
      pollCount = 0; // Resetujemy licznik
      pollForSync(quizQuestions, token, sessionData, partner, appDiv, currentIndex, onQuizCompleted);
    });
    document.getElementById("resetBtn").addEventListener("click", () => {
      window.location.href = window.location.origin + window.location.pathname;
    });
    return;
  }
  
  loadQuizRow(token).then(row => {
    if (!row) {
      appDiv.innerHTML = `
        <p>Błąd: Nie można załadować quizu z bazy.</p>
        <button id='retryBtn'>Spróbuj ponownie</button>
      `;
      document.getElementById("retryBtn").addEventListener("click", () => {
        pollForSync(quizQuestions, token, sessionData, partner, appDiv, currentIndex, onQuizCompleted);
      });
      return;
    }
    
    const p1Answers = row.partner1_answers || {};
    const p2Answers = row.partner2_answers || {};
    
    // Obliczamy bieżący indeks na nowo – powinniśmy mieć ten sam, jeśli druga strona nie odpowiedziała.
    const newIndex = Math.min(Object.keys(p1Answers).length, Object.keys(p2Answers).length);
    
    console.log(`Polling - P1: ${Object.keys(p1Answers).length} odpowiedzi, P2: ${Object.keys(p2Answers).length} odpowiedzi, nowy indeks: ${newIndex}`);
    
    if (newIndex > currentIndex) {
      // Obie strony udzieliły odpowiedzi – resetujemy licznik i przechodzimy do synchronizacji kolejnego pytania.
      console.log("Obaj partnerzy odpowiedzieli podczas pollingu, przechodzimy dalej");
      pollCount = 0;
      setTimeout(() => {
        syncQuiz(quizQuestions, token, sessionData, partner, appDiv, onQuizCompleted);
      }, 500);
    } else {
      // Jeśli aktualny gracz jeszcze nie odpowiedział, wyświetlamy pytanie
      const currentQuestion = quizQuestions[currentIndex];
      const currentPlayerAnswers = (partner === "1") ? p1Answers : p2Answers;
      
      if (currentPlayerAnswers[currentQuestion.id] === undefined) {
        // Ten przypadek nie powinien się zdarzyć, ale dla bezpieczeństwa wyświetlamy pytanie ponownie
        console.log("Dziwny stan - partner nie ma odpowiedzi w pollingu, pokazuję pytanie ponownie");
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
          loadQuizRow(token).then(latestRow => {
            const updatedP1 = latestRow.partner1_answers || {};
            const updatedP2 = latestRow.partner2_answers || {};
            
            if (partner === "1") {
              updatedP1[currentQuestion.id] = { 
                category: currentQuestion.category, 
                type: currentQuestion.type, 
                answer: answer 
              };
            } else {
              updatedP2[currentQuestion.id] = { 
                category: currentQuestion.category, 
                type: currentQuestion.type, 
                answer: answer 
              };
            }
            
            upsertQuizRow(token, sessionData, updatedP1, updatedP2).then(() => {
              pollForSync(quizQuestions, token, sessionData, partner, appDiv, currentIndex, onQuizCompleted);
            });
          });
        });
      } else {
        // Wyświetlamy ładny ekran oczekiwania
        const waitingFor = (partner === "1") ? sessionData.partner2Name : sessionData.partner1Name;
        showWaitingScreen(appDiv, waitingFor, pollCount);
        
        // Planujemy następne sprawdzenie
        pollTimeoutId = setTimeout(() => {
          pollForSync(quizQuestions, token, sessionData, partner, appDiv, currentIndex, onQuizCompleted);
        }, POLL_INTERVAL);
      }
    }
  }).catch(err => {
    console.error("Błąd podczas pollowania:", err);
    appDiv.innerHTML = `
      <p>Wystąpił błąd podczas sprawdzania odpowiedzi partnera.</p>
      <button id='retryBtn'>Spróbuj ponownie</button>
    `;
    document.getElementById("retryBtn").addEventListener("click", () => {
      pollForSync(quizQuestions, token, sessionData, partner, appDiv, currentIndex, onQuizCompleted);
    });
  });
}

/**
 * Funkcja wyświetlająca wyniki quizu.
 */
export async function computeAndShowResults(token, appDiv) {
  try {
    const row = await loadQuizRow(token);
    
    if (!row) {
      appDiv.innerHTML = `
        <p>Błąd: Nie można załadować quizu z bazy.</p>
        <button id='retryBtn'>Spróbuj ponownie</button>
      `;
      document.getElementById("retryBtn").addEventListener("click", () => {
        computeAndShowResults(token, appDiv);
      });
      return;
    }
    
    const sessionData = row.session_data || {};
    const answers1 = row.partner1_answers || {};
    const answers2 = row.partner2_answers || {};
    const p1 = sessionData.partner1Name || "Partner1";
    const p2 = sessionData.partner2Name || "Partner2";
    const quizQuestions = sessionData.quizQuestions || [];
    
    if (Object.keys(answers1).length !== quizQuestions.length || Object.keys(answers2).length !== quizQuestions.length) {
      appDiv.innerHTML = `
        <p>Oczekiwanie na zakończenie quizu przez oboje partnerów...</p>
        <div class="progress-indicator">
          <p>${p1}: ${Object.keys(answers1).length}/${quizQuestions.length} odpowiedzi</p>
          <p>${p2}: ${Object.keys(answers2).length}/${quizQuestions.length} odpowiedzi</p>
        </div>
      `;
      setTimeout(() => computeAndShowResults(token, appDiv), 1000);
      return;
    }
    
    let total = quizQuestions.length;
    let agreements = 0;
    const categoriesStats = {};
    
    const detailsHTML = quizQuestions.map(q => {
      // Inicjalizacja statystyk dla kategorii, jeśli nie istnieją
      if (!categoriesStats[q.category]) {
        categoriesStats[q.category] = { total: 0, matches: 0 };
      }
      
      categoriesStats[q.category].total++;
      
      const questionText = formatText(q.text, p1, p2);
      const a1 = answers1[q.id]?.answer;
      const a2 = answers2[q.id]?.answer;
      const answer1 = a1 === "1" ? p1 : a1 === "2" ? p2 : a1;
      const answer2 = a2 === "1" ? p1 : a2 === "2" ? p2 : a2;
      const isMatch = (a1 === a2);
      
      if (isMatch) {
        agreements++;
        categoriesStats[q.category].matches++;
      }
      
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
    
    // Obliczenie zgodności ogólnej
    const overallAgreement = ((agreements / total) * 100).toFixed(2);
    
    // Przygotowanie statystyk dla kategorii
    const categoryStatsHTML = Object.keys(categoriesStats).map(category => {
      const stats = categoriesStats[category];
      const percent = ((stats.matches / stats.total) * 100).toFixed(2);
      return `<div class="category-stat">
        <strong>${category}:</strong> ${percent}% zgodności (${stats.matches}/${stats.total})
      </div>`;
    }).join("");
    
    // Wyświetlenie wyników z dodanymi statystykami kategorii
    showQuizResults(
      appDiv, 
      p1, 
      p2, 
      overallAgreement, 
      categoryStatsHTML,
      detailsHTML, 
      () => {
        window.location.href = window.location.origin + window.location.pathname;
      }
    );
    
  } catch (err) {
    console.error("Błąd przy wyświetlaniu wyników:", err);
    appDiv.innerHTML = `
      <p>Wystąpił błąd podczas obliczania wyników.</p>
      <button id='retryBtn'>Spróbuj ponownie</button>
      <button id='homeBtn'>Wróć do strony głównej</button>
    `;
    document.getElementById("retryBtn").addEventListener("click", () => {
      computeAndShowResults(token, appDiv);
    });
    document.getElementById("homeBtn").addEventListener("click", () => {
      window.location.href = window.location.origin + window.location.pathname;
    });
  }
}
