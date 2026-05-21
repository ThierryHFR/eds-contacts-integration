"use strict";

const result = document.getElementById("result");
const testButton = document.getElementById("test-helper");
const syncButton = document.getElementById("sync-now");

function show(value) {
  result.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

async function send(type) {
  try {
    show("Exécution…");
    const response = await messenger.runtime.sendMessage({ type });
    show(response);
  } catch (err) {
    show({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

testButton.addEventListener("click", () => send("testHelper"));
syncButton.addEventListener("click", () => send("syncNow"));
