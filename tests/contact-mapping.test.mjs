import assert from "node:assert/strict";
import test from "node:test";

import { getVCardUid, recoverStoredContactMappings } from "../contact-mapping.mjs";


test("reads a UID from a vCard", () => {
  const vcard = "BEGIN:VCARD\r\nVERSION:4.0\r\nUID;VALUE=text:stable-uid\r\nEND:VCARD\r\n";
  assert.equal(getVCardUid(vcard), "stable-uid");
});

test("unfolds a continued UID line", () => {
  const vcard = "BEGIN:VCARD\nUID:stable-\n uid\nEND:VCARD\n";
  assert.equal(getVCardUid(vcard), "stable-uid");
});

test("recovers a missing mapping for a previously synchronized contact", () => {
  const contactMap = {};
  const contactHashes = { "stable-uid": "stored-hash" };
  const nodes = [{ id: "thunderbird-id", vCard: "BEGIN:VCARD\nUID:stable-uid\nEND:VCARD\n" }];

  assert.deepEqual(
    recoverStoredContactMappings(nodes, contactMap, contactHashes),
    ["stable-uid"],
  );
  assert.equal(contactMap["stable-uid"], "thunderbird-id");
});

test("repairs a mapping whose Thunderbird contact no longer exists", () => {
  const contactMap = { "stable-uid": "missing-id" };
  const contactHashes = { "stable-uid": "stored-hash" };
  const nodes = [{ id: "replacement-id", vCard: "BEGIN:VCARD\nUID:stable-uid\nEND:VCARD\n" }];

  recoverStoredContactMappings(nodes, contactMap, contactHashes);

  assert.equal(contactMap["stable-uid"], "replacement-id");
});

test("does not adopt a new Thunderbird contact without sync history", () => {
  const contactMap = {};
  const nodes = [{ id: "new-id", vCard: "BEGIN:VCARD\nUID:new-uid\nEND:VCARD\n" }];

  assert.deepEqual(recoverStoredContactMappings(nodes, contactMap, {}), []);
  assert.deepEqual(contactMap, {});
});

test("keeps an existing valid mapping", () => {
  const contactMap = { "stable-uid": "existing-id" };
  const contactHashes = { "stable-uid": "stored-hash" };
  const nodes = [
    { id: "existing-id", vCard: "BEGIN:VCARD\nUID:stable-uid\nEND:VCARD\n" },
    { id: "duplicate-id", vCard: "BEGIN:VCARD\nUID:stable-uid\nEND:VCARD\n" },
  ];

  assert.deepEqual(recoverStoredContactMappings(nodes, contactMap, contactHashes), []);
  assert.equal(contactMap["stable-uid"], "existing-id");
});
