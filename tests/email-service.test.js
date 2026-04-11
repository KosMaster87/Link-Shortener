/**
 * @fileoverview Unit-Tests für email-service (Resend API)
 * @description Testet sendFeedbackNotification ohne echten HTTP-Request.
 *   Nutzt Dependency Injection (_fetch-Parameter) statt mock.module.
 * @module tests/email-service.test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sendFeedbackNotification } from "../src/services/email-service.js";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

const withEnv = (vars, fn) => async () => {
  const original = {};
  for (const [k, v] of Object.entries(vars)) {
    original[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = String(v);
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

/** Fake-fetch der den gesendeten Request aufzeichnet. */
const fakeFetch = (status = 200) => {
  let captured = null;
  const fn = async (url, options) => {
    captured = { url, ...options, body: JSON.parse(options.body) };
    return { ok: status >= 200 && status < 300, status, text: async () => "" };
  };
  fn.getCaptured = () => captured;
  return fn;
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("sendFeedbackNotification", () => {
  it(
    "überspringt Senden wenn RESEND_API_KEY nicht gesetzt ist",
    withEnv(
      {
        RESEND_API_KEY: undefined,
        TO_EMAIL: "to@example.com",
        FROM_EMAIL: "from@example.com",
      },
      async () => {
        const f = fakeFetch();
        await sendFeedbackNotification({ type: "bug", description: "Test" }, f);
        assert.equal(
          f.getCaptured(),
          null,
          "fetch darf nicht aufgerufen werden",
        );
      },
    ),
  );

  it(
    "überspringt Senden wenn TO_EMAIL nicht gesetzt ist",
    withEnv(
      {
        RESEND_API_KEY: "re_test",
        TO_EMAIL: undefined,
        FROM_EMAIL: "from@example.com",
      },
      async () => {
        const f = fakeFetch();
        await sendFeedbackNotification({ type: "bug", description: "Test" }, f);
        assert.equal(
          f.getCaptured(),
          null,
          "fetch darf nicht aufgerufen werden",
        );
      },
    ),
  );

  it(
    "Subject enthält den Feedback-Typ als Label",
    withEnv(
      {
        RESEND_API_KEY: "re_test",
        TO_EMAIL: "to@example.com",
        FROM_EMAIL: "from@dev2k.org",
      },
      async () => {
        const f = fakeFetch();
        await sendFeedbackNotification(
          { type: "improvement", description: "Dark Mode wäre schön." },
          f,
        );
        assert.ok(f.getCaptured(), "fetch muss aufgerufen worden sein");
        assert.match(f.getCaptured().body.subject, /Verbesserungsvorschlag/);
      },
    ),
  );

  it(
    "E-Mail des Nutzers erscheint im Text wenn angegeben",
    withEnv(
      {
        RESEND_API_KEY: "re_test",
        TO_EMAIL: "to@example.com",
        FROM_EMAIL: "from@dev2k.org",
      },
      async () => {
        const f = fakeFetch();
        await sendFeedbackNotification(
          {
            type: "bug",
            description: "Login crasht.",
            email: "nutzer@example.com",
          },
          f,
        );
        assert.ok(f.getCaptured()?.body.text.includes("nutzer@example.com"));
      },
    ),
  );

  it(
    "kein Absender-Feld im Text wenn keine Nutzer-Email angegeben",
    withEnv(
      {
        RESEND_API_KEY: "re_test",
        TO_EMAIL: "to@example.com",
        FROM_EMAIL: "from@dev2k.org",
      },
      async () => {
        const f = fakeFetch();
        await sendFeedbackNotification(
          { type: "other", description: "Sonstiges." },
          f,
        );
        assert.ok(!f.getCaptured()?.body.text.includes("Antwort an:"));
      },
    ),
  );

  it(
    "wirft Fehler bei nicht-ok Response",
    withEnv(
      {
        RESEND_API_KEY: "re_test",
        TO_EMAIL: "to@example.com",
        FROM_EMAIL: "from@dev2k.org",
      },
      async () => {
        const f = fakeFetch(401);
        await assert.rejects(
          () =>
            sendFeedbackNotification({ type: "bug", description: "Test" }, f),
          /Resend API Fehler 401/,
        );
      },
    ),
  );
});
