"use strict";

import { recoverStoredContactMappings } from "./contact-mapping.mjs";

const PREFS = {
  version: 200,
  addressBookName: "Evolution",
  contactMap: {},
  contactHashes: {},
  pendingThunderbirdContactIds: [],
  pendingThunderbirdContacts: {},
  syncConsentGranted: false,
  syncEnabled: false,
  reverseSyncEnabled: false,
  deleteMissingContacts: false,
  helperName: "eds_contacts_helper",
  watchIntervalSeconds: 10,
  startupDelaySeconds: 20,
  reverseDelaySeconds: 20,
  postReverseDelaySeconds: 20
};

let started = false;
let syncRunning = false;
let captureThunderbirdChanges = true;
let edsToThunderbirdWriteDepth = 0;
let port = null;
let nextRequestId = 1;
const pendingRequests = new Map();
const locallyCreatedContactIds = new Set();
let startupTimer = null;
let reverseTimer = null;
let postReverseTimer = null;

function log(message, ...args) { console.log(`[edscontacts] ${message}`, ...args); }
function warn(message, ...args) { console.warn(`[edscontacts] ${message}`, ...args); }
function error(message, ...args) { console.error(`[edscontacts] ${message}`, ...args); }

async function ensurePrefs() {
  const existing = await messenger.storage.local.get();
  if (!existing || !existing.version || existing.version < PREFS.version) {
    await messenger.storage.local.set({
      ...PREFS,
      contactMap: existing.contactMap || {},
      contactHashes: existing.contactHashes || {},
      pendingThunderbirdContactIds: existing.pendingThunderbirdContactIds || [],
      pendingThunderbirdContacts: existing.pendingThunderbirdContacts || {},
      // A new explicit consent is required when migrating to version 2.0.0.
      syncConsentGranted: false,
      syncEnabled: false,
      reverseSyncEnabled: false,
      deleteMissingContacts: false,
      watchIntervalSeconds: Math.max(5, Number(existing.watchIntervalSeconds || PREFS.watchIntervalSeconds))
    });
  }
}

function syncIsAuthorized(prefs) {
  return prefs.syncConsentGranted === true && prefs.syncEnabled === true;
}

async function connectHelper() {
  const prefs = await messenger.storage.local.get();
  if (port) return port;
  const helperName = prefs.helperName || PREFS.helperName;
  port = messenger.runtime.connectNative(helperName);
  port.onMessage.addListener(onNativeMessage);
  port.onDisconnect.addListener(() => {
    const err = messenger.runtime.lastError;
    warn(`Native helper disconnected${err ? ': ' + err.message : ''}`);
    for (const [, pending] of pendingRequests) {
      pending.reject(new Error(err ? err.message : "Native helper disconnected"));
    }
    pendingRequests.clear();
    port = null;
  });
  return port;
}

function onNativeMessage(message) {
  if (!message) return;
  const requestId = message.requestId;
  if (requestId && pendingRequests.has(requestId)) {
    const pending = pendingRequests.get(requestId);
    pendingRequests.delete(requestId);
    if (message.ok === false) pending.reject(new Error(message.error || "Native helper error"));
    else pending.resolve(message);
    return;
  }
  if (message.event === "edsChanged") {
    log(`EDS change event from helper: ${message.reason || "changed"}`);
    messenger.storage.local.get().then(prefs => {
      if (syncIsAuthorized(prefs)) runEdsToThunderbird("eds-event");
    });
    return;
  }
  if (message.event === "watchStarted") {
    log(`Native helper watch started every ${message.intervalSeconds}s`);
    return;
  }
  if (message.event === "watchError") {
    warn(`Native helper watch error: ${message.error || "unknown"}`);
    return;
  }
}

async function nativeCall(action, payload = {}) {
  const p = await connectHelper();
  const requestId = nextRequestId++;
  const message = { requestId, action, ...payload };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Native helper timeout for ${action}`));
    }, 120000);
    pendingRequests.set(requestId, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (err) => { clearTimeout(timer); reject(err); }
    });
    p.postMessage(message);
  });
}

async function startNativeWatch() {
  const prefs = await messenger.storage.local.get();
  if (!syncIsAuthorized(prefs)) return false;
  const intervalSeconds = Math.max(5, Number(prefs.watchIntervalSeconds || PREFS.watchIntervalSeconds));
  await nativeCall("watch", { intervalSeconds });
  return true;
}

async function getOrCreateAddressBook(name) {
  const books = await messenger.addressBooks.list(false);
  const existing = books.find(book => book.name === name);
  if (existing) return existing.id;
  const id = await messenger.addressBooks.create({ name });
  log(`Created Thunderbird address book: ${name}`);
  return id;
}

async function sha256(text) {
  const data = new TextEncoder().encode(text || "");
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

function getContactNodeVCard(contactNode) {
  if (!contactNode) return null;
  if (typeof contactNode.vCard === "string") return contactNode.vCard;
  if (contactNode.properties && typeof contactNode.properties.vCard === "string") return contactNode.properties.vCard;
  return null;
}

async function contactStillExists(contactId) {
  try { await messenger.addressBooks.contacts.get(contactId); return true; }
  catch (_) { return false; }
}

async function createThunderbirdContactFromEds(addressBookId, vcard) {
  edsToThunderbirdWriteDepth++;
  try {
    const created = await messenger.addressBooks.contacts.create(addressBookId, vcard);
    if (created) {
      locallyCreatedContactIds.add(created);
      setTimeout(() => locallyCreatedContactIds.delete(created), 180000);
    }
    return created;
  } finally { edsToThunderbirdWriteDepth--; }
}

async function updateThunderbirdContactFromEds(contactId, vcard) {
  edsToThunderbirdWriteDepth++;
  try { await messenger.addressBooks.contacts.update(contactId, vcard); }
  finally { edsToThunderbirdWriteDepth--; }
}

async function deleteThunderbirdContact(contactId, edsUid) {
  try { await messenger.addressBooks.contacts.delete(contactId); log(`Deleted Thunderbird contact for removed EDS contact ${edsUid}`); }
  catch (e) { warn(`Could not delete Thunderbird contact ${contactId}; removing mapping anyway`, e); }
}

async function syncContactsToThunderbird(contacts) {
  const prefs = await messenger.storage.local.get();
  const addressBookId = await getOrCreateAddressBook(prefs.addressBookName || PREFS.addressBookName);
  const contactMap = prefs.contactMap || {};
  const contactHashes = prefs.contactHashes || {};
  const existingContacts = await messenger.addressBooks.contacts.list(addressBookId);
  const recoveredUids = recoverStoredContactMappings(existingContacts, contactMap, contactHashes);
  if (recoveredUids.length) {
    log(`Recovered ${recoveredUids.length} stored contact mapping(s) from Thunderbird vCard UIDs`);
  }
  const currentEdsUids = new Set();
  let createdCount = 0, updatedCount = 0, unchangedCount = 0, deletedCount = 0, remappedCount = 0;
  for (const contact of contacts || []) {
    if (!contact || !contact.uid || !contact.vcard) { warn("Ignoring EDS contact without uid/vcard", contact); continue; }
    currentEdsUids.add(contact.uid);
    const hash = await sha256(contact.vcard);
    try {
      if (contactMap[contact.uid]) {
        if (!(await contactStillExists(contactMap[contact.uid]))) {
          delete contactMap[contact.uid]; delete contactHashes[contact.uid];
          const created = await createThunderbirdContactFromEds(addressBookId, contact.vcard);
          contactMap[contact.uid] = created; contactHashes[contact.uid] = hash; remappedCount++; continue;
        }
        if (contactHashes[contact.uid] === hash) { unchangedCount++; continue; }
        await updateThunderbirdContactFromEds(contactMap[contact.uid], contact.vcard);
        contactHashes[contact.uid] = hash; updatedCount++;
      } else {
        const created = await createThunderbirdContactFromEds(addressBookId, contact.vcard);
        contactMap[contact.uid] = created; contactHashes[contact.uid] = hash; createdCount++;
      }
    } catch (e) { error(`Failed to create/update Thunderbird contact for EDS uid ${contact.uid}`, e); }
  }
  for (const [edsUid, thunderbirdContactId] of Object.entries(contactMap)) {
    if (!currentEdsUids.has(edsUid)) {
      if (prefs.deleteMissingContacts === true) {
        await deleteThunderbirdContact(thunderbirdContactId, edsUid);
        delete contactMap[edsUid]; delete contactHashes[edsUid]; deletedCount++;
      } else {
        warn(`EDS contact ${edsUid} is missing; Thunderbird contact retained because deletion propagation is disabled`);
      }
    }
  }
  await messenger.storage.local.set({ contactMap, contactHashes });
  log(`EDS->Thunderbird complete: ${createdCount} created, ${updatedCount} updated, ${unchangedCount} unchanged, ${deletedCount} deleted, ${remappedCount} remapped`);
}

async function runLocked(label, fn) {
  if (syncRunning) { log(`${label} skipped: another sync phase is already running`); return null; }
  syncRunning = true;
  try { return await fn(); }
  catch (e) { error(`${label} failed`, e); return null; }
  finally { syncRunning = false; captureThunderbirdChanges = true; }
}

function scheduleTimer(kind, delaySeconds, fn) {
  const delay = Math.max(1, Number(delaySeconds || 20)) * 1000;
  if (kind === "startup" && startupTimer) clearTimeout(startupTimer);
  if (kind === "reverse" && reverseTimer) clearTimeout(reverseTimer);
  if (kind === "postReverse" && postReverseTimer) clearTimeout(postReverseTimer);
  const timer = setTimeout(fn, delay);
  if (kind === "startup") startupTimer = timer;
  if (kind === "reverse") reverseTimer = timer;
  if (kind === "postReverse") postReverseTimer = timer;
}

async function runEdsToThunderbird(reason) {
  const prefs = await messenger.storage.local.get();
  if (!syncIsAuthorized(prefs)) {
    warn(`EDS->Thunderbird (${reason}) ignored: synchronization is not authorized and enabled`);
    return false;
  }
  return runLocked(`EDS->Thunderbird (${reason})`, async () => {
    captureThunderbirdChanges = false;
    log(`EDS->Thunderbird started (${reason})`);
    const response = await nativeCall("listContacts");
    await syncContactsToThunderbird(response.contacts || []);
    captureThunderbirdChanges = true;
    scheduleTimer("reverse", PREFS.reverseDelaySeconds, () => runThunderbirdToEds("controlled-reverse"));
    log(`Thunderbird->EDS controlled phase scheduled in ${PREFS.reverseDelaySeconds}s`);
    return true;
  });
}

async function runThunderbirdToEds(reason) {
  return runLocked(`Thunderbird->EDS (${reason})`, async () => {
    const prefs = await messenger.storage.local.get();
    if (!syncIsAuthorized(prefs)) { log("Thunderbird->EDS disabled: synchronization is not authorized and enabled"); return 0; }
    if (prefs.reverseSyncEnabled === false) { log("Thunderbird->EDS disabled by preference"); return 0; }
    const pending = prefs.pendingThunderbirdContactIds || [];
    const pendingData = prefs.pendingThunderbirdContacts || {};
    if (!pending.length) { log("Thunderbird->EDS: no pending contacts"); return 0; }
    const contactMap = prefs.contactMap || {};
    const contactHashes = prefs.contactHashes || {};
    const mappedThunderbirdIds = new Set(Object.values(contactMap));
    let createdInEds = 0;
    const stillPending = new Set();
    const stillPendingData = {};
    for (const id of pending) {
      try {
        if (mappedThunderbirdIds.has(id)) continue;
        let vcard = pendingData[id] && pendingData[id].vcard;
        if (!vcard) {
          try {
            const node = await messenger.addressBooks.contacts.get(id);
            vcard = getContactNodeVCard(node);
          } catch (getError) {
            warn(`Pending Thunderbird contact ${id} no longer exists and no captured vCard is available; dropping it`, getError);
            continue;
          }
        }
        if (!vcard) { warn(`Pending Thunderbird contact ${id} has no vCard; skipped`); continue; }
        const response = await nativeCall("addContact", { vcard });
        if (!response.uid) throw new Error("Native helper returned no uid for addContact");
        contactMap[response.uid] = id;
        contactHashes[response.uid] = await sha256(vcard);
        createdInEds++;
        log(`Thunderbird contact ${id} added to EDS as ${response.uid}`);
      } catch (e) {
        warn(`Pending Thunderbird contact ${id} could not be synced to EDS; keeping it in queue`, e);
        stillPending.add(id);
        if (pendingData[id]) stillPendingData[id] = pendingData[id];
      }
    }
    await messenger.storage.local.set({ contactMap, contactHashes, pendingThunderbirdContactIds: Array.from(stillPending), pendingThunderbirdContacts: stillPendingData });
    log(`Thunderbird->EDS complete: ${createdInEds} created-in-EDS`);
    if (createdInEds > 0) {
      scheduleTimer("postReverse", PREFS.postReverseDelaySeconds, () => runEdsToThunderbird("post-reverse"));
      log(`Post-reverse EDS->Thunderbird scheduled in ${PREFS.postReverseDelaySeconds}s`);
    }
    return createdInEds;
  });
}

async function queueThunderbirdContactForEds(contactNode) {
  try {
    if (!contactNode || !contactNode.id) return;
    if (!captureThunderbirdChanges || edsToThunderbirdWriteDepth > 0 || locallyCreatedContactIds.has(contactNode.id)) {
      log(`Ignoring extension-created/internal contact ${contactNode.id}`); return;
    }
    const prefs = await messenger.storage.local.get();
    if (!syncIsAuthorized(prefs)) { log("Thunderbird->EDS capture disabled until the user explicitly enables synchronization"); return; }
    if (prefs.reverseSyncEnabled === false) { log("Thunderbird->EDS capture disabled by preference"); return; }
    const addressBookId = await getOrCreateAddressBook(prefs.addressBookName || PREFS.addressBookName);
    if (contactNode.parentId && contactNode.parentId !== addressBookId) { log(`Ignoring contact ${contactNode.id}: not in Evolution address book`); return; }
    const vcard = getContactNodeVCard(contactNode);
    if (!vcard) { warn(`Thunderbird contact ${contactNode.id} has no vCard at creation time; not queued`); return; }
    const pending = new Set(prefs.pendingThunderbirdContactIds || []);
    const pendingData = prefs.pendingThunderbirdContacts || {};
    pending.add(contactNode.id);
    pendingData[contactNode.id] = { vcard, capturedAt: Date.now() };
    await messenger.storage.local.set({ pendingThunderbirdContactIds: Array.from(pending), pendingThunderbirdContacts: pendingData });
    log(`Queued Thunderbird contact ${contactNode.id} for controlled Thunderbird->EDS phase with captured vCard`);
    scheduleTimer("reverse", PREFS.reverseDelaySeconds, () => runThunderbirdToEds("contact-created"));
  } catch (e) { error("Failed to queue Thunderbird contact", e); }
}

if (messenger.addressBooks && messenger.addressBooks.contacts && messenger.addressBooks.contacts.onCreated) {
  messenger.addressBooks.contacts.onCreated.addListener(contactNode => { queueThunderbirdContactForEds(contactNode); });
}

if (messenger.runtime && messenger.runtime.onMessage) {
  messenger.runtime.onMessage.addListener(message => {
    if (message && message.command === "sync-now") runEdsToThunderbird("manual-message");
  });
}

async function start() {
  if (started) return;
  started = true;
  await ensurePrefs();
  const prefs = await messenger.storage.local.get();
  log("Starting EDS Contacts Integration 2.0.1");
  if (!syncIsAuthorized(prefs)) {
    log("Synchronization is disabled until explicit consent is granted in the extension settings");
    return;
  }
  try {
    const ping = await nativeCall("ping");
    log(`Native helper available: ${ping.version || "unknown"}`);
    try { const diag = await nativeCall("diagnostics"); log(`Native helper diagnostics: ${JSON.stringify(diag)}`); }
    catch (diagError) { warn("Native helper diagnostics failed", diagError); }
    await startNativeWatch();
  } catch (e) { error("Native helper is not available. Install it with install-native-helper.sh before syncing.", e); }
  scheduleTimer("startup", PREFS.startupDelaySeconds, () => runEdsToThunderbird("startup-delayed"));
  log(`Startup EDS->Thunderbird sync scheduled in ${PREFS.startupDelaySeconds}s; periodic Thunderbird alarm disabled`);
}

start().catch(e => error("Startup failed", e));

messenger.runtime.onMessage.addListener(async (message) => {
  if (!message || !message.type) return undefined;
  if (message.type === "getSettings") {
    const prefs = await messenger.storage.local.get();
    return {
      ok: true,
      settings: {
        syncConsentGranted: prefs.syncConsentGranted === true,
        syncEnabled: prefs.syncEnabled === true,
        reverseSyncEnabled: prefs.reverseSyncEnabled === true,
        deleteMissingContacts: prefs.deleteMissingContacts === true
      }
    };
  }
  if (message.type === "saveSettings") {
    const requested = message.settings || {};
    const syncConsentGranted = requested.syncConsentGranted === true;
    const syncEnabled = syncConsentGranted && requested.syncEnabled === true;
    const reverseSyncEnabled = syncEnabled && requested.reverseSyncEnabled === true;
    const deleteMissingContacts = syncEnabled && requested.deleteMissingContacts === true;
    await messenger.storage.local.set({ syncConsentGranted, syncEnabled, reverseSyncEnabled, deleteMissingContacts });
    if (syncEnabled) {
      try {
        await nativeCall("ping");
        await startNativeWatch();
      } catch (err) {
        return { ok: false, error: `Paramètres enregistrés, mais le helper est indisponible : ${err && err.message ? err.message : String(err)}` };
      }
    } else if (port) {
      port.disconnect();
      port = null;
    }
    return { ok: true, message: syncEnabled ? "Synchronisation activée." : "Synchronisation désactivée." };
  }
  if (message.type === "testHelper") {
    try {
      const prefs = await messenger.storage.local.get();
      if (prefs.syncConsentGranted !== true) {
        return { ok: false, error: "Le consentement est requis avant de lire les contacts EDS avec le helper." };
      }
      const ping = await nativeCall("ping");
      const diagnostics = await nativeCall("diagnostics");
      let listContacts;
      try {
        listContacts = await nativeCall("listContacts");
      } catch (err) {
        listContacts = { ok: false, error: err && err.message ? err.message : String(err) };
      }
      return { ok: true, ping, diagnostics, listContacts };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  }
  if (message.type === "syncNow") {
    try {
      const prefs = await messenger.storage.local.get();
      if (!syncIsAuthorized(prefs)) {
        return { ok: false, error: "Activez d’abord la synchronisation dans les paramètres." };
      }
      const completed = await runEdsToThunderbird("manual-options");
      if (completed !== true) {
        return { ok: false, error: "La synchronisation n’a pas pu être terminée. Consultez la console de l’extension." };
      }
      return { ok: true, message: "Synchronisation EDS -> Thunderbird terminée." };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  }
  return undefined;
});
