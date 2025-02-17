import { fullQuizData } from "./quizData.js";
import { upsertQuizRow } from "./database.js";

export function showCreateQuiz(appDiv, generateToken, onQuizCreated) {
  appDiv.innerHTML = `
    <h1>Quiz dla Zakochanych</h1>
    <p>Wprowadź imiona obojga partnerów, aby utworzyć quiz.</p>
    <form id="createQuizForm">
      <label for="partner1Name">Imię Partnera 1:</label>
      <input type="text" id="partner1Name" name="partner1Name" required />
      <label for="partner2Name">Imię Partnera 2:</label>
      <input type="text" id="partner2Name" name="partner2Name" required />
      <button type="submit">Utwórz Quiz</button>
    </form>
  `;
  document.getElementById("createQuizForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p1 = e.target.partner1Name.value.trim();
    const p2 = e.target.partner2Name.value.trim();
    if (!p1 || !p2) {
      alert("Podaj oba imiona.");
      return;
    }
    const token = generateToken();
    const sessionData = { partner1Name: p1, partner2Name: p2, selectedCategories: [], quizQuestions: [] };
    await upsertQuizRow(token, sessionData, {}, {});
    onQuizCreated(token, sessionData);
  });
}

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
  document.getElementById("categoryForm").addEventListener("submit", async (e) => {
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

export function showQuizLink(appDiv, token, sessionData) {
  const baseUrl = window.location.origin + window.location.pathname;
  const partner2Link = `${baseUrl}?token=${token}&partner=2`;
  appDiv.innerHTML = `
    <h2>Quiz stworzony!</h2>
    <p>Wyślij ten link Partnerowi 2:</p>
    <div class="link-box" id="partner2Link">${partner2Link}</div>
    <button id="copyBtn">Kopiuj link</button>
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
  document.getElementById("startQuizBtn").addEventListener("click", () => {
    // Ustawiamy globalny callback – main.js odczyta go, aby rozpocząć quiz dla partnera 1
    if (typeof window.startQuizCallback === "function") {
      window.startQuizCallback("1");
    }
  });
}

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
