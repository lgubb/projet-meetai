import assert from "node:assert/strict";
import test from "node:test";

import { detectJeanCommand, parseJeanIntent } from "./index.js";

test("detectJeanCommand only accepts explicit commands addressed to Jean", () => {
  assert.deepEqual(detectJeanCommand("Jean, crée une spec"), {
    isAddressedToJean: true,
    commandText: "crée une spec"
  });

  assert.deepEqual(detectJeanCommand("Il faudrait faire une recherche"), {
    isAddressedToJean: false,
    commandText: null
  });
});

test("parseJeanIntent detects French research commands", () => {
  const intent = parseJeanIntent("Jean, fais une recherche sur LiveKit");

  assert.equal(intent.shouldAct, true);
  assert.equal(intent.taskType, "research");
  assert.equal(intent.artifactType, "RESEARCH");
  assert.equal(intent.title, "Research: LiveKit");
  assert.equal(intent.language, "fr");
});

test("parseJeanIntent detects English document commands", () => {
  const intent = parseJeanIntent("Jean, create a spec for onboarding");

  assert.equal(intent.shouldAct, true);
  assert.equal(intent.taskType, "doc");
  assert.equal(intent.artifactType, "DOCUMENT");
  assert.equal(intent.title, "Spec");
  assert.equal(intent.responseText, "Yes, I will create a spec.");
});

test("parseJeanIntent rejects low-confidence commands", () => {
  const implicit = parseJeanIntent("Il faudrait faire une recherche");
  const unknown = parseJeanIntent("Jean, tu en penses quoi ?");

  assert.equal(implicit.shouldAct, false);
  assert.equal(implicit.confidence, 0);
  assert.equal(unknown.shouldAct, false);
  assert.equal(unknown.confidence, 0.2);
});
