import { showCategorySelection, showQuizLink } from "./ui.js";
import { startSyncQuiz, computeAndShowResults } from "./quizLogic.js";
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
   * do stworzenia nowego quizu.
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
      const newToken = generateToken();
      const sessionData = {
        partner1Name: p1,
        partner2Name: p2,
        selectedCategories: [],
        quizQuestions: []
      };
      await upsertQuizRow(newToken, sessionData, {}, {});
      // Przekierowanie do Partnera 1 (kategorie)
      window.location.href = `?token=${newToken}&partner=1`;
    });
  } else {
    // Jeśli nie masz formularza startowego w index.html, możesz wyświetlić komunikat
    appDiv.innerHTML = "<p>Brak formularza do utworzenia quizu.</p>";
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
      // Jeśli kategorie nie zostały jeszcze wybrane – pokazujemy wybór
      if (!sessionData.selectedCategories || sessionData.selectedCategories.length === 0) {
        showCategorySelection(appDiv, sessionData, (updatedSessionData) => {
          showQuizLink(appDiv, token, updatedSessionData);
          // Gdy Partner 1 kliknie "Rozpocznij quiz", uruchamiamy startSyncQuiz
          window.startQuizCallback = () => {
            startSyncQuiz(token, updatedSessionData, "1", appDiv, () => {
              computeAndShowResults(token, appDiv);
            });
          };
        });
      } else {
        // Kategorie już wybrane => pokazujemy link dla Partnera 2
        showQuizLink(appDiv, token, sessionData);
        // Callback do rozpoczęcia quizu
        window.startQuizCallback = () => {
          startSyncQuiz(token, sessionData, "1", appDiv, () => {
            computeAndShowResults(token, appDiv);
          });
        };
      }

    } else if (partner === "2") {
      // Partner 2 czeka, aż Partner 1 wybierze kategorie
      function waitForQuizConfig() {
        loadQuizRow(token).then((row2) => {
          const updatedSessionData = row2?.session_data || {};
          // Jeśli quizQuestions nie zostało zbudowane (Partner 1 nie wybrał kategorii), czekamy
          if (!updatedSessionData.selectedCategories || updatedSessionData.selectedCategories.length === 0) {
            appDiv.innerHTML = `<p>Partner 1 nie skonfigurował jeszcze quizu. Czekaj...</p>`;
            setTimeout(waitForQuizConfig, 1000);
          } else {
            // Gdy Partner 1 wybrał kategorie, uruchamiamy quiz w trybie synchronicznym
            startSyncQuiz(token, updatedSessionData, "2", appDiv, () => {
              computeAndShowResults(token, appDiv);
            });
          }
        });
      }
      waitForQuizConfig();

    } else {
      appDiv.innerHTML = "<p>Błąd: Nieprawidłowy parametr partner (musi być '1' lub '2').</p>";
    }
  });
}
