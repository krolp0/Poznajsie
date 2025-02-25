import { fullQuizData } from "./quizData.js";

/**
 * Wyświetlanie wyboru kategorii (dla Partnera 1)
 */
export function showCategorySelection(appDiv, sessionData, onCategoriesSelected) {
  const categoryOptions = fullQuizData.map((cat, index) => {
    return `<div class="category-option">
              <label>
                <input type="checkbox" name="category" value="${cat.category}" ${index < 2 ? "checked" : ""}>
                ${cat.category}
              </label>
              <span class="category-description">${getQuestionCount(cat)} pytań</span>
            </div>`;
  }).join("");

  appDiv.innerHTML = `
    <h2>Wybierz kategorie quizu</h2>
    <p>Zaznacz kategorie, które chcesz uwzględnić w quizie dla Ciebie i ${sessionData.partner2Name}.</p>
    <form id="categoryForm">
      <div class="category-list">
        ${categoryOptions}
      </div>
      <div class="category-controls">
        <button type="button" id="selectAllBtn">Zaznacz wszystkie</button>
        <button type="button" id="unselectAllBtn">Odznacz wszystkie</button>
      </div>
      <button type="submit" class="primary-button">Zapisz wybór kategorii</button>
    </form>
  `;

  // Funkcja pomocnicza do liczenia pytań w kategorii
  function getQuestionCount(category) {
    return category.questions ? category.questions.length : 0;
  }

  // Obsługa przycisków do zaznaczania/odznaczania wszystkich kategorii
  document.getElementById("selectAllBtn").addEventListener("click", () => {
    const checkboxes = document.querySelectorAll('input[name="category"]');
    checkboxes.forEach(checkbox => checkbox.checked = true);
  });

  document.getElementById("unselectAllBtn").addEventListener("click", () => {
    const checkboxes = document.querySelectorAll('input[name="category"]');
    checkboxes.forEach(checkbox => checkbox.checked = false);
  });

  document.getElementById("categoryForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const selected = Array.from(document.querySelectorAll('input[name="category"]:checked')).map(el => el.value);
    
    if (!selected.length) {
      showAlert(appDiv, "Wybierz przynajmniej jedną kategorię.");
      return;
    }
    
    const selectedCats = fullQuizData.filter(cat => selected.includes(cat.category));
    sessionData.selectedCategories = selectedCats;
    
    // Informuj użytkownika o zapisywaniu
    appDiv.innerHTML = `<p>Zapisywanie wybranych kategorii...</p>`;
    
    // Małe opóźnienie dla lepszego UX
    setTimeout(() => {
      onCategoriesSelected(sessionData);
    }, 500);
  });
}

/**
 * Funkcja pomocnicza do wyświetlania alertów
 */
function showAlert(appDiv, message) {
  const alertElement = document.createElement("div");
  alertElement.className = "alert-message";
  alertElement.innerHTML = message;
  
  // Znajdź istniejące alerty i usuń je
  const existingAlerts = appDiv.querySelectorAll('.alert-message');
  existingAlerts.forEach(alert => alert.remove());
  
  // Dodaj alert na początku appDiv
  if (appDiv.firstChild) {
    appDiv.insertBefore(alertElement, appDiv.firstChild);
  } else {
    appDiv.appendChild(alertElement);
  }
  
  // Automatyczne usunięcie po 3 sekundach
  setTimeout(() => {
    alertElement.classList.add('fade-out');
    setTimeout(() => alertElement.remove(), 500);
  }, 3000);
}

/**
 * Wyświetlanie linku dla Partnera 2 oraz przycisków do kopiowania, generowania QR Code
 */
export function showQuizLink(appDiv, token, sessionData) {
  const baseUrl = window.location.origin + window.location.pathname;
  const partner2Link = `${baseUrl}?token=${token}&partner=2`;
  
  appDiv.innerHTML = `
    <h2>Quiz stworzony!</h2>
    <p>Witaj, <strong>${sessionData.partner1Name}</strong>! Twój quiz dla Ciebie i <strong>${sessionData.partner2Name}</strong> jest gotowy.</p>
    
    <div class="share-section">
      <h3>Udostępnij quiz</h3>
      <p>Wyślij ten link do ${sessionData.partner2Name}:</p>
      <div class="link-box" id="partner2Link">${partner2Link}</div>
      <div class="button-group">
        <button id="copyBtn" class="action-button">
          <span class="icon">📋</span> Kopiuj link
        </button>
        <button id="shareBtn" class="action-button">
          <span class="icon">📤</span> Udostępnij
        </button>
      </div>
    </div>
    
    <div class="qr-section">
      <h3>Lub zeskanuj kod QR</h3>
      <p>${sessionData.partner2Name} może zeskanować ten kod QR swoim telefonem:</p>
      <div id="qrcode" class="qr-code-container"></div>
    </div>
    
    <div class="start-section">
      <h3>Rozpocznij quiz</h3>
      <p>Kliknij poniższy przycisk, aby rozpocząć quiz jako <strong>${sessionData.partner1Name}</strong>:</p>
      <button id="startQuizBtn" class="primary-button">Rozpocznij quiz</button>
    </div>
  `;

  // Generowanie QR Code z linkiem
  new QRCode(document.getElementById("qrcode"), {
    text: partner2Link,
    width: 180,
    height: 180,
    colorDark: "#d6336c",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });

  // Obsługa kopiowania linku
  document.getElementById("copyBtn").addEventListener("click", () => {
    const linkText = document.getElementById("partner2Link").innerText;
    navigator.clipboard.writeText(linkText)
      .then(() => {
        showAlert(appDiv, "✓ Link został skopiowany!");
      })
      .catch(err => {
        console.error('Błąd przy kopiowaniu: ', err);
        // Fallback dla starszych przeglądarek
        const textArea = document.createElement("textarea");
        textArea.value = linkText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showAlert(appDiv, "✓ Link został skopiowany!");
      });
  });

  // Obsługa udostępniania (Web Share API)
  document.getElementById("shareBtn").addEventListener("click", () => {
    if (navigator.share) {
      navigator.share({
        title: 'Quiz dla Zakochanych',
        text: `${sessionData.partner1Name} zaprasza Cię do wspólnego quizu!`,
        url: partner2Link,
      })
      .then(() => console.log('Udostępniono pomyślnie'))
      .catch((error) => console.log('Błąd udostępniania', error));
    } else {
      showAlert(appDiv, "Twoja przeglądarka nie obsługuje funkcji udostępniania.");
    }
  });

  // Obsługa rozpoczęcia quizu
  document.getElementById("startQuizBtn").addEventListener("click", () => {
    if (typeof window.startQuizCallback === "function") {
      window.startQuizCallback();
    }
  });
}

/**
 * Wyświetlanie pojedynczego pytania
 */
export function showQuestion(appDiv, questionIndex, totalQuestions, questionText, optionsHTML, onAnswerSelected) {
  appDiv.innerHTML = `
    <div class="quiz-container">
      <div class="progress">
        <div class="progress-text">Pytanie ${questionIndex + 1} z ${totalQuestions}</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${(questionIndex + 1) / totalQuestions * 100}%"></div>
        </div>
      </div>
      
      <div class="question-container">
        <h2 class="question-text">${questionText}</h2>
      </div>
      
      <div class="tile-container">
        ${optionsHTML}
      </div>
    </div>
  `;
  
  const tiles = document.querySelectorAll('.tile');
  
  // Dodanie efektu hover/active dla kafelków
  tiles.forEach(tile => {
    tile.addEventListener('mouseenter', () => {
      tile.classList.add('tile-hover');
    });
    
    tile.addEventListener('mouseleave', () => {
      tile.classList.remove('tile-hover');
    });
    
    tile.addEventListener('click', () => {
      // Usunięcie aktywnej klasy z wszystkich kafelków
      tiles.forEach(t => t.classList.remove('tile-active'));
      
      // Dodanie aktywnej klasy do klikniętego kafelka
      tile.classList.add('tile-active');
      
      // Pobranie odpowiedzi i wywołanie callbacka po krótkim opóźnieniu
      // (aby użytkownik zobaczył efekt kliknięcia)
      const answer = tile.getAttribute('data-answer');
      setTimeout(() => {
        onAnswerSelected(answer);
      }, 300);
    });
  });
}

/**
 * Wyświetlanie ekranu oczekiwania
 */
export function showWaitingScreen(appDiv, waitingFor, waitTime = 0) {
  // Obliczamy przybliżony czas oczekiwania w sekundach
  const waitSeconds = Math.floor(waitTime);
  
  // Animowany loader
  const dots = waitSeconds % 4; // 0-3 kropki
  const dotsDisplay = '.'.repeat(dots + 1);
  
  appDiv.innerHTML = `
    <div class="waiting-container">
      <h2>Oczekiwanie na partnera</h2>
      <p>Czekaj na odpowiedź od <strong>${waitingFor}</strong>${dotsDisplay}</p>
      
      <div class="loader">
        <div class="loader-spinner"></div>
      </div>
      
      <p class="waiting-time">${waitSeconds > 10 ? `Czas oczekiwania: ${waitSeconds} sekund` : ''}</p>
      
      <div class="waiting-message">
        <p>Możesz wysłać wiadomość do partnera, aby przypomnieć o quizie:</p>
        <button id="reminderBtn" class="secondary-button">
          <span class="icon">💬</span> Wyślij przypomnienie
        </button>
      </div>
    </div>
  `;
  
  // Obsługa przycisku przypomnienia
  const reminderBtn = document.getElementById('reminderBtn');
  if (reminderBtn) {
    reminderBtn.addEventListener('click', () => {
      if (navigator.share) {
        navigator.share({
          title: 'Przypomnienie o Quizie dla Zakochanych',
          text: `Hej, czekam na Twoją odpowiedź w naszym quizie! 💕`,
        })
        .then(() => showAlert(appDiv, "Przypomnienie wysłane!"))
        .catch(error => console.log('Błąd udostępniania', error));
      } else {
        showAlert(appDiv, "Skopiowano tekst przypomnienia do schowka!");
        navigator.clipboard.writeText(`Hej, czekam na Twoją odpowiedź w naszym quizie! 💕`);
      }
    });
  }
}

/**
 * Wyświetlanie wyników quizu
 */
export function showQuizResults(appDiv, p1, p2, overallAgreement, categoryStatsHTML, detailsHTML, onReset) {
  // Określenie "poziomu zgodności" na podstawie wyniku
  let compatibilityLevel = "";
  let compatibilityEmoji = "";
  
  if (parseFloat(overallAgreement) >= 90) {
    compatibilityLevel = "Doskonała zgodność!";
    compatibilityEmoji = "❤️❤️❤️";
  } else if (parseFloat(overallAgreement) >= 75) {
    compatibilityLevel = "Wysoka zgodność";
    compatibilityEmoji = "❤️❤️";
  } else if (parseFloat(overallAgreement) >= 50) {
    compatibilityLevel = "Umiarkowana zgodność";
    compatibilityEmoji = "❤️";
  } else if (parseFloat(overallAgreement) >= 30) {
    compatibilityLevel = "Niska zgodność";
    compatibilityEmoji = "💔";
  } else {
    compatibilityLevel = "Bardzo niska zgodność";
    compatibilityEmoji = "💔💔";
  }
  
  appDiv.innerHTML = `
    <div class="results-container">
      <h2>Wyniki Quizu</h2>
      
      <div class="results-header">
        <div class="results-names">
          <span class="partner-name">${p1}</span>
          <span class="vs-text">vs</span>
          <span class="partner-name">${p2}</span>
        </div>
        
        <div class="compatibility-score">
          <div class="score-circle" style="background: conic-gradient(#d6336c ${overallAgreement}%, #f8d7da 0);">
            <span class="score-value">${overallAgreement}%</span>
          </div>
          <div class="compatibility-level">
            <span>${compatibilityLevel}</span>
            <span class="emoji">${compatibilityEmoji}</span>
          </div>
        </div>
      </div>
      
      <div class="results-categories">
        <h3>Zgodność w kategoriach:</h3>
        <div class="category-stats">
          ${categoryStatsHTML}
        </div>
      </div>
      
      <div class="results-details">
        <h3>Szczegółowe odpowiedzi:</h3>
        <div class="toggle-details">
          <button id="toggleDetailsBtn" class="secondary-button">Pokaż szczegóły</button>
        </div>
        <div id="detailsContainer" class="hidden">
          <ul class="details-list">
            ${detailsHTML}
          </ul>
        </div>
      </div>
      
      <div class="actions">
        <button id="shareResultsBtn" class="action-button">
          <span class="icon">📤</span> Udostępnij wyniki
        </button>
        <button id="resetBtn" class="primary-button">Nowy quiz</button>
      </div>
    </div>
  `;
  
  // Obsługa przycisku przełączania szczegółów
  document.getElementById("toggleDetailsBtn").addEventListener("click", () => {
    const detailsContainer = document.getElementById("detailsContainer");
    const toggleBtn = document.getElementById("toggleDetailsBtn");
    
    if (detailsContainer.classList.contains("hidden")) {
      detailsContainer.classList.remove("hidden");
      toggleBtn.textContent = "Ukryj szczegóły";
    } else {
      detailsContainer.classList.add("hidden");
      toggleBtn.textContent = "Pokaż szczegóły";
    }
  });
  
  // Obsługa przycisku udostępniania wyników
  document.getElementById("shareResultsBtn").addEventListener("click", () => {
    const shareText = `${p1} i ${p2} osiągnęli ${overallAgreement}% zgodności w "Quizie dla Zakochanych"! ${compatibilityEmoji}`;
    
    if (navigator.share) {
      navigator.share({
        title: 'Wyniki Quizu dla Zakochanych',
        text: shareText
      })
      .catch(error => console.log('Błąd udostępniania', error));
    } else {
      navigator.clipboard.writeText(shareText)
        .then(() => {
          showAlert(appDiv, "Wyniki skopiowane do schowka!");
        })
        .catch(err => {
          console.error('Błąd przy kopiowaniu: ', err);
        });
    }
  });
  
  // Obsługa przycisku resetowania
  document.getElementById("resetBtn").addEventListener("click", onReset);
}
