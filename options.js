"use strict";

const result = document.getElementById("result");
const form = document.getElementById("settings-form");
const consentInput = document.getElementById("sync-consent");
const syncInput = document.getElementById("sync-enabled");
const reverseInput = document.getElementById("reverse-enabled");
const deleteInput = document.getElementById("delete-missing");
const testButton = document.getElementById("test-helper");
const syncButton = document.getElementById("sync-now");

function show(value) {
  result.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function updateControls() {
  syncInput.disabled = !consentInput.checked;
  if (!consentInput.checked) syncInput.checked = false;
  reverseInput.disabled = !syncInput.checked;
  deleteInput.disabled = !syncInput.checked;
  if (!syncInput.checked) {
    reverseInput.checked = false;
    deleteInput.checked = false;
  }
  testButton.disabled = !consentInput.checked;
  syncButton.disabled = !consentInput.checked || !syncInput.checked;
}

async function send(type, extra = {}) {
  try {
    show("Exécution…");
    const response = await messenger.runtime.sendMessage({ type, ...extra });
    show(response);
    return response;
  } catch (err) {
    const response = { ok: false, error: err && err.message ? err.message : String(err) };
    show(response);
    return response;
  }
}

async function loadSettings() {
  const response = await send("getSettings");
  if (!response || !response.ok) return;
  const settings = response.settings || {};
  consentInput.checked = settings.syncConsentGranted === true;
  syncInput.checked = settings.syncEnabled === true;
  reverseInput.checked = settings.reverseSyncEnabled === true;
  deleteInput.checked = settings.deleteMissingContacts === true;
  updateControls();
  show("Paramètres chargés. Le helper n’est contacté que lorsque vous l’autorisez.");
}

consentInput.addEventListener("change", updateControls);
syncInput.addEventListener("change", updateControls);

form.addEventListener("submit", async event => {
  event.preventDefault();
  await send("saveSettings", {
    settings: {
      syncConsentGranted: consentInput.checked,
      syncEnabled: syncInput.checked,
      reverseSyncEnabled: reverseInput.checked,
      deleteMissingContacts: deleteInput.checked
    }
  });
  updateControls();
});

testButton.addEventListener("click", () => send("testHelper"));
syncButton.addEventListener("click", () => send("syncNow"));

loadSettings();
