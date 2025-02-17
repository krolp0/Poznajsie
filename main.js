import { showCreateQuiz, showCategorySelection, showQuizLink } from "./ui.js";
import { startQuiz, computeAndShowResults } from "./quizLogic.js";
import { loadQuizRow } from "./database.js";

const appDiv = document.getElementById("app");

function getQueryParam(param) {
  const params = new URLSearchParams(window.location.search);
  return params.get(param);
}

function generateToken() {
  return Math.random().toString(36).substr(2, 8);
}

const token = getQueryParam("token");
const partner = getQueryParam("partner");

if (!token) {
  // Partner 1 tworzy quiz
  showCreateQuiz(appDiv, generateToken, (tokenCreated, sessionData) => {
    window.location.href = `?token=${tokenCreated}&partner=1`;
  });
} else {
  loadQuizRow(token).then(row => {
    if (!row) {
      appDiv.innerHTML = "<p>Błąd: Nie znaleziono quizu w bazie. Sprawdź link.</p>";
      return;
    }
    const sessionData = row.session_data || {};
    if (partner === "1") {
      // Jeśli kategorie nie zostały jeszcze wybrane – wybór kategorii
      if (!sessionData.selectedCategories || sessionData.selectedCategories.length === 0) {
        showCategorySelection(appDiv, sessionData, (updatedSessionData) => {
          showQuizLink(appDiv, token, updatedSessionData);
          // Ustaw globalny callback do rozpoczęcia quizu dla partnera 1
          window.startQuizCallback = (partnerId) => {
            startQuiz(token, updatedSessionData, partnerId, appDiv, () => {
              computeAndShowResults(token, appDiv);
            });
          };
        });
      } else {
        showQuizLink(appDiv, token, sessionData);
        window.startQuizCallback = (partnerId) => {
          startQuiz(token, sessionData, partnerId, appDiv, () => {
            computeAndShowResults(token, appDiv);
          });
        };
      }
    } else if (partner === "2") {
      // Mechanizm odpytywania dla Partnera 2 – czeka, aż quiz zostanie skonfigurowany przez Partnera 1
      function waitForQuizConfig() {
        loadQuizRow(token).then(row => {
          const updatedSessionData = row?.session_data || {};
          if (!updatedSessionData.quizQuestions || updatedSessionData.quizQuestions.length === 0) {
            appDiv.innerHTML = `<p>Partner 1 nie skonfigurował jeszcze quizu. Czekaj...</p>`;
            setTimeout(waitForQuizConfig, 1000); // sprawdzaj ponownie za 1 sekundę
          } else {
            startQuiz(token, updatedSessionData, "2", appDiv, () => {
              computeAndShowResults(token, appDiv);
            });
          }
        });
      }
      waitForQuizConfig();
    } else {
      appDiv.innerHTML = "<p>Błąd: Nieprawidłowy parametr partner.</p>";
    }
  });
}
