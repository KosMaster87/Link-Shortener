/**
 * @fileoverview Integrationstests für POST /api/feedback via handleFeedback
 * @description Testet den Route-Handler direkt – ohne den HTTP-Server zu starten.
 *   Nutzt die echte DB, damit der Constraint-Check (CHECK type IN ...) greift.
 * @module tests/feedback.test
 */
import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { pool } from "../src/db/index.js";
import { handleFeedback } from "../src/routes/feedback.js";

/**
 * Minimaler Fake-Request für handleFeedback.
 * @param {object} body
 * @returns {import("node:http").IncomingMessage}
 */
const fakeReq = (body) => ({ body });

/**
 * Sammelt den gesendeten Status-Code und JSON-Body.
 * @returns {{ res: object, result: () => { status: number, body: object } }}
 */
const fakeRes = () => {
  const state = { status: null, body: null };
  const res = {
    writeHead(status) {
      state.status = status;
    },
    end(raw) {
      state.body = JSON.parse(raw);
    },
  };
  return { res, result: () => state };
};

afterEach(async () => {
  await pool.query(
    "DELETE FROM feedback WHERE email LIKE 'test-%@example.com'",
  );
});

after(() => pool.end());

// ─── Validierung ──────────────────────────────────────────────────────────────

describe("handleFeedback – Validierung", () => {
  it("gibt 422 zurück bei ungültigem type", async () => {
    const { res, result } = fakeRes();
    await handleFeedback(
      fakeReq({ type: "invalid", description: "Test" }),
      res,
    );
    assert.equal(result().status, 422);
    assert.equal(result().body.error, "INVALID_INPUT");
  });

  it("gibt 422 zurück bei fehlendem type", async () => {
    const { res, result } = fakeRes();
    await handleFeedback(fakeReq({ description: "Test" }), res);
    assert.equal(result().status, 422);
  });

  it("gibt 422 zurück bei leerer description", async () => {
    const { res, result } = fakeRes();
    await handleFeedback(fakeReq({ type: "bug", description: "   " }), res);
    assert.equal(result().status, 422);
    assert.equal(result().body.error, "INVALID_INPUT");
  });

  it("gibt 422 zurück bei fehlender description", async () => {
    const { res, result } = fakeRes();
    await handleFeedback(fakeReq({ type: "bug" }), res);
    assert.equal(result().status, 422);
  });

  it("gibt 422 zurück bei ungültiger E-Mail", async () => {
    const { res, result } = fakeRes();
    await handleFeedback(
      fakeReq({ type: "other", description: "Test", email: "kein-at" }),
      res,
    );
    assert.equal(result().status, 422);
    assert.equal(result().body.error, "INVALID_INPUT");
  });
});

// ─── Erfolgsfälle ─────────────────────────────────────────────────────────────

describe("handleFeedback – Speichern", () => {
  it("speichert Feedback ohne E-Mail und gibt 201 zurück", async () => {
    const { res, result } = fakeRes();
    await handleFeedback(
      fakeReq({ type: "bug", description: "Login crasht." }),
      res,
    );
    assert.equal(result().status, 201);
    assert.equal(result().body.message, "Danke für dein Feedback!");
  });

  it("speichert Feedback mit optionaler E-Mail", async () => {
    const { res, result } = fakeRes();
    await handleFeedback(
      fakeReq({
        type: "improvement",
        description: "Dark Mode wäre schön.",
        email: `test-${Date.now()}@example.com`,
      }),
      res,
    );
    assert.equal(result().status, 201);
  });

  it("akzeptiert leeren E-Mail-String als kein E-Mail", async () => {
    const { res, result } = fakeRes();
    await handleFeedback(
      fakeReq({ type: "other", description: "Sonstiges.", email: "" }),
      res,
    );
    assert.equal(result().status, 201);
  });

  it("speichert alle drei erlaubten Typen", async () => {
    for (const type of ["bug", "improvement", "other"]) {
      const { res, result } = fakeRes();
      await handleFeedback(
        fakeReq({ type, description: `Test für ${type}` }),
        res,
      );
      assert.equal(result().status, 201, `Typ ${type} sollte 201 liefern`);
    }
  });
});
