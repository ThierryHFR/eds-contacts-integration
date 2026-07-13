"use strict";

function unescapeVCardText(value) {
  return String(value || "").replace(/\\([nN,;\\])/g, (_match, escaped) => {
    if (escaped === "n" || escaped === "N") return "\n";
    return escaped;
  });
}

export function getVCardUid(vcard) {
  if (typeof vcard !== "string" || !vcard) return null;
  const unfolded = vcard.replace(/\r?\n[ \t]/g, "");
  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const property = line.slice(0, separator).split(";", 1)[0].trim();
    if (property.toUpperCase() !== "UID") continue;
    const uid = unescapeVCardText(line.slice(separator + 1)).trim();
    return uid || null;
  }
  return null;
}

export function recoverStoredContactMappings(contactNodes, contactMap, contactHashes) {
  const nodes = Array.isArray(contactNodes) ? contactNodes : [];
  const map = contactMap || {};
  const hashes = contactHashes || {};
  const existingIds = new Set(nodes.map(node => node && node.id).filter(Boolean));
  const claimedIds = new Set(
    Object.values(map).filter(contactId => existingIds.has(contactId))
  );
  const recoveredUids = [];

  for (const node of nodes) {
    if (!node || !node.id) continue;
    const uid = getVCardUid(node.vCard || (node.properties && node.properties.vCard));
    if (!uid || !Object.prototype.hasOwnProperty.call(hashes, uid)) continue;

    const mappedId = map[uid];
    if (mappedId && existingIds.has(mappedId)) continue;
    if (claimedIds.has(node.id)) continue;

    map[uid] = node.id;
    claimedIds.add(node.id);
    recoveredUids.push(uid);
  }

  return recoveredUids;
}
