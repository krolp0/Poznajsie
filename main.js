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
  // Używamy statycznego formularza z index.html
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
      window.location.href = `?token=${newToken}&partner=1`;
    });
  }
} else {
  loadQuizRow(token).then((row) => {
    if (!row) {
      appDiv.innerHTML = "<p>Błąd: Nie znaleziono quizu w bazie. Sprawdź link.</p>";
      return;
    }
    const sessionData = row.session_data || {};
    if (partner === "1") {
      if (!sessionData.selectedCategories || sessionData.selectedCategories.length === 0) {
        showCategorySelection(appDiv, sessionData, (updatedSessionData) => {
          showQuizLink(appDiv, token, updatedSessionData);
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
      function waitForQuizConfig() {
        loadQuizRow(token).then((row2) => {
          const updatedSessionData = row2?.session_data || {};
          if (!updatedSessionData.quizQuestions || updatedSessionData.quizQuestions.length === 0) {
            appDiv.innerHTML = `<p>Partner 1 nie skonfigurował jeszcze quizu. Czekaj...</p>`;
            setTimeout(waitForQuizConfig, 1000);
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

/**
 * Funkcja skanowania QR Code przy użyciu phonegap-plugin-barcodescanner.
 * Wymaga instalacji pluginu: 
 *   ionic cordova plugin add phonegap-plugin-barcodescanner
 *   npm install @ionic-native/barcode-scanner
 */
function scanQRCode() {
  if (cordova && cordova.plugins && cordova.plugins.barcodeScanner) {
    cordova.plugins.barcodeScanner.scan(
      function (result) {
        if (!result.cancelled && result.text) {
          window.location.href = result.text;
        }
      },
      function (error) {
        alert("Skanowanie nie powiodło się: " + error);
      },
      {
        preferFrontCamera: false,
        showFlipCameraButton: true,
        showTorchButton: true,
        torchOn: false,
        saveHistory: false,
        prompt: "Przyłóż aparat do QR Code",
        resultDisplayDuration: 500,
        formats: "QR_CODE",
        orientation: "portrait"
      }
    );
  } else {
    alert("Funkcja skanowania QR Code nie jest dostępna.");
  }
}
window.scanQRCode = scanQRCode;
