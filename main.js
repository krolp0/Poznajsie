import { showCategorySelection, showQuizLink } from "./ui.js";
import { startSyncQuiz, computeAndShowResults } from "./quizLogic.js";
import { loadQuizRow, upsertQuizRow } from "./database.js";

const appDiv = document.getElementById("app");

/**
 * Pobiera parametr z URL
 */
function getQueryParam(param) {
  const params = new URLSearchParams(window.location.search);
  return params.get(param);
}

/**
 * Generuje unikalny token dla quizu
 */
function generateToken() {
  return Math.random().toString(36).substr(2, 8) + 
         Math.random().toString(36).substr(2, 4);
}

/**
 * Pokazuje loader przy ładowaniu
 */
function showLoader(message = "Wczytywanie...") {
  appDiv.innerHTML = `
    <div class="loader-container">
      <div class="loader-spinner"></div>
      <p>${message}</p>
    </div>
  `;
}

/**
 * Pokazuje obsługę błędów
 */
function showError(message, retryAction = null) {
  appDiv.innerHTML = `
    <div class="error-container">
      <h3>Wystąpił błąd</h3>
      <p>${message}</p>
      ${retryAction ? `<button id="retryBtn" class="secondary-button">Spróbuj ponownie</button>` : ''}
      <button id="homeBtn" class="primary-button">Wróć do strony głównej</button>
    </div>
  `;
  
  if (retryAction) {
    document.getElementById("retryBtn").addEventListener("click", retryAction);
  }
  
  document.getElementById("homeBtn").addEventListener("click", () => {
    window.location.href = window.location.origin + window.location.pathname;
  });
}

// Początek wykonania skryptu
document.addEventListener("DOMContentLoaded", () => {
  const token = getQueryParam("token");
  const partner = getQueryParam("partner");

  // Brak tokenu => tworzenie nowego quizu
  if (!token) {
    /**
     * Brak tokenu => używamy statycznego formularza z index.html (id="createQuizForm")
     * do stworzenia nowego quizu.
     */
    const formEl = document.getElementById("createQuizForm");
    if (formEl) {
      formEl.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        // Pobranie wartości z formularza
        const p1 = e.target.partner1Name.value.trim();
        const p2 = e.target.partner2Name.value.trim();
        
        // Walidacja
        if (!p1 || !p2) {
          // Wyświetl komunikat błędu
          const errorMsg = document.createElement("div");
          errorMsg.className = "error-message";
          errorMsg.textContent = "Podaj oba imiona.";
          
          // Usuń poprzednie komunikaty błędów
          const prevError = formEl.querySelector(".error-message");
          if (prevError) prevError.remove();
          
          formEl.insertBefore(errorMsg, formEl.firstChild);
          return;
        }
        
        // Pokaż loader
        showLoader("Tworzenie quizu...");
        
        try {
          // Generowanie tokenu i inicjalizacja danych sesji
          const newToken = generateToken();
          const sessionData = {
            partner1Name: p1,
            partner2Name: p2,
            selectedCategories: [],
            quizQuestions: [],
            createdAt: new Date().toISOString()
          };
          
          // Zapisanie wiersza quizu
          await upsertQuizRow(newToken, sessionData, {}, {});
          
          // Przekierowanie do Partnera 1 (wybór kategorii)
          window.location.href = `?token=${newToken}&partner=1`;
        } catch (error) {
          console.error("Błąd przy tworzeniu quizu:", error);
          showError("Nie udało się utworzyć quizu. Sprawdź połączenie z internetem i spróbuj ponownie.");
        }
      });
    } else {
      showError("Nie znaleziono formularza do utworzenia quizu.");
    }
  } else {
    // Mamy token => obsługa flow quizu
    showLoader("Wczytywanie quizu...");
    
    loadQuizRow(token).then((row) => {
      if (!row) {
        showError("Nie znaleziono quizu. Sprawdź poprawność linku lub utwórz nowy quiz.");
        return;
      }
      
      const sessionData = row.session_data || {};
      
      // Sprawdzenie, czy sesja ma podstawowe dane
      if (!sessionData.partner1Name || !sessionData.partner2Name) {
        showError("Nieprawidłowe dane sesji quizu. Utwórz nowy quiz.");
        return;
      }

      if (partner === "1") {
        // Partner 1 - wybór kategorii lub wyświetlenie linku dla Partnera 2
        if (!sessionData.selectedCategories || sessionData.selectedCategories.length === 0) {
          showCategorySelection(appDiv, sessionData, (updatedSessionData) => {
            // Zapisanie wybranych kategorii
            upsertQuizRow(token, updatedSessionData, {}, {}).then(() => {
              showQuizLink(appDiv, token, updatedSessionData);
              
              // Gdy Partner 1 kliknie "Rozpocznij quiz", uruchamiamy startSyncQuiz
              window.startQuizCallback = () => {
                startSyncQuiz(token, updatedSessionData, "1", appDiv, () => {
                  computeAndShowResults(token, appDiv);
                });
              };
            }).catch(err => {
              console.error("Błąd przy zapisywaniu kategorii:", err);
              showError("Nie udało się zapisać kategorii. Spróbuj ponownie.", () => {
                showCategorySelection(appDiv, sessionData, (updatedSessionData) => {
                  showQuizLink(appDiv, token, updatedSessionData);
                });
              });
            });
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
              appDiv.innerHTML = `
                <div class="waiting-start-container">
                  <h2>Ocz
