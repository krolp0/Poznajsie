import { showCategorySelection, showQuizLink } from "./ui.js";
import { startQuiz, computeAndShowResults } from "./quizLogic.js";
import { loadQuizRow, upsertQuizRow } from "./database.js";

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
  /**
   * Brak tokenu => używamy statycznego formularza z index.html (id="createQuizForm")
   */
  const formEl = document.getElementById("createQuizForm");
  if (formEl) {
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      const p1 = e.target.partner1Name.value.trim();
      const p2 = e.target.partner2Name.value.trim();
      if (!p1 || !p2) {
        alert("Podaj oba imiona.");
        return;
      }
      // Generujemy token
      const newToken = generateToken();
      // Tworzymy sessionData z pustymi kategoriami i pytaniami
      const sessionData = {
        partner1Name: p1,
        partner2Name: p2,
        selectedCategories: [],
        quizQuestions: []
      };
      // Zapisujemy nowy wiersz w bazie
      await upsertQuizRow(newToken, sessionData, {}, {});
      // Przechodzimy do widoku Partnera 1 (kategorie)
      window.location.href = `?token=${newToken}&partner=1`;
    });
  }
} else {
  // Mamy token => sprawdzamy, czy partner = 1 czy partner = 2
  loadQuizRow(token).then((row) => {
    if (!row) {
      appDiv.innerHTML = "<p>Błąd: Nie znaleziono quizu w bazie. Sprawdź link.</p>";
      return;
    }
    const sessionData = row.session_data || {};

    if (partner === "1") {
      // Jeśli kategorie nie zostały wybrane – wybór kategorii
      if (!sessionData.selectedCategories || sessionData.selectedCategories.length === 0) {
        showCategorySelection(appDiv, sessionData, (updatedSessionData) => {
          showQuizLink(appDiv, token, updatedSessionData);
          // Callback do startu quizu partnera 1
          window.startQuizCallback = (partnerId) => {
            startQuiz(token, updatedSessionData, partnerId, appDiv, () => {
              computeAndShowResults(token, appDiv);
            });
          };
        });
      } else {
        // Kategorie już wybrane => link dla Partnera 2 + start quizu
        showQuizLink(appDiv, token, sessionData);
        window.startQuizCallback = (partnerId) => {
          startQuiz(token, sessionData, partnerId, appDiv, () => {
            computeAndShowResults(token, appDiv);
          });
        };
      }
    } else if (partner === "2") {
      // Partner 2 czeka, aż Partner 1 skonfiguruje quiz
      function waitForQuizConfig() {
        loadQuizRow(token).then((row2) => {
          const updatedSessionData = row2?.session_data || {};
          if (!updatedSessionData.quizQuestions || updatedSessionData.quizQuestions.length === 0) {
            appDiv.innerHTML = `<p>Partner 1 nie skonfigurował jeszcze quizu. Czekaj...</p>`;
            setTimeout(waitForQuizConfig, 1000);
          } else {
            // Start quizu Partnera 2
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
