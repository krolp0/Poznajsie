import { fullQuizData } from "./quizData.js";

/**
 * Wyświetlanie wyboru kategorii (dla Partnera 1)
 */
export function showCategorySelection(appDiv, sessionData, onCategoriesSelected) {
  const categoryOptions = fullQuizData.map((cat, index) => {
    return `<div>
              <label>
                <input type="checkbox" name="category" value="${cat.category}" ${index === 0 ? "checked" : ""}>
                ${cat.category}
              </label>
            </div>`;
  }).join("");

  appDiv.innerHTML = `
    <h2>Wybierz kategorie quizu</h2>
    <form id="categoryForm">
      ${categoryOptions}
      <button type="submit">Zapisz wybór kategorii</button>
    </form>
  `;

  document.getElementById("categoryForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const selected = Array.from(document.querySelectorAll('input[name="category"]:checked')).map(el => el.value);
    if (!selected.length) {
      alert("Wybierz przynajmniej jedną kategorię.");
      return;
    }
    const selectedCats = fullQuizData.filter(cat => selected.includes(cat.category));
    sessionData.selectedCategories = selectedCats;
    onCategoriesSelected(sessionData);
  });
}

/**
 * Wyświetlanie linku dla Partnera 2 oraz przycisków do kopiowania, generowania QR Code i skanowania
 */
export function showQuizLink(appDiv, token, sessionData) {
  const baseUrl = window.location.origin + window.location.pathname;
  const partner2Link = `${baseUrl}?token=${token}&partner=2`;
  appDiv.innerHTML = `
    <h2>Quiz stworzony!</h2>
    <p>Wyślij ten link Partnerowi 2:</p>
    <div class="link-box" id="partner2Link">${partner2Link}</div>
    <button id="copyBtn">Kopiuj link</button>
    <hr />
    <p>Lub udostępnij QR Code, który Partner 2 może zeskanować:</p>
    <div id="qrcode" style="margin: 0 auto; width: 150px; height: 150px;"></div>
    <br />
    <button id="scanQRBtn">Skanuj QR Code</button>
    <hr />
    <p>Jako <strong>${sessionData.partner1Name}</strong> kliknij przycisk, aby rozpocząć quiz.</p>
    <button id="startQuizBtn">Rozpocznij quiz</button>
  `;
  document.getElementById("copyBtn").addEventListener("click", () => {
    const linkText = document.getElementById("partner2Link").innerText;
    navigator.clipboard.writeText(linkText).then(() => {
      alert("Link został skopiowany!");
    });
  });
  // Generowanie QR Code z linkiem
  new QRCode(document.getElementById("qrcode"), {
    text: partner2Link,
    width: 150,
    height: 150
  });
  // Obsługa przycisku do skanowania QR Code
  document.getElementById("scanQRBtn").addEventListener("click", () => {
    if (typeof scanQRCode === "function") {
      scanQRCode();
    } else {
      alert("Funkcja skanowania QR Code nie jest dostępna.");
    }
  });
  document.getElementById("startQuizBtn").addEventListener("click", () => {
    if (typeof window.startQuizCallback === "function") {
      window.startQuizCallback("1");
    }
  });
}

/**
 * Wyświetlanie pojedynczego pytania
 */
export function showQuestion(appDiv, questionIndex, totalQuestions, questionText, optionsHTML, onAnswerSelected) {
  appDiv.innerHTML = `
    <div class="progress">Pytanie ${questionIndex + 1} z ${totalQuestions}</div>
    <h2>${questionText}</h2>
    <div class="tile-container">
      ${optionsHTML}
    </div>
  `;
  document.querySelectorAll('.tile').forEach(tile => {
    tile.addEventListener('click', () => {
      const answer = tile.getAttribute('data-answer');
      onAnswerSelected(answer);
    });
  });
}

/**
 * Wyświetlanie wyników quizu
 */
export function showQuizResults(appDiv, p1, p2, overallAgreement, detailsHTML, onReset) {
  appDiv.innerHTML = `
    <h2>Wyniki Quizu</h2>
    <p><strong>${p1}</strong> vs <strong>${p2}</strong></p>
    <p>Ogólna zgodność: <strong>${overallAgreement}%</strong></p>
    <h3>Szczegółowe odpowiedzi:</h3>
    <ul>${detailsHTML}</ul>
    <button id="resetBtn">Resetuj Quiz</button>
  `;
  document.getElementById("resetBtn").addEventListener("click", onReset);
}
