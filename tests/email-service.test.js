/**
 * @fileoverview Unit-Tests für email-service
 * @description Testet sendFeedbackNotification ohne echten SMTP-Server.
 *   Nutzt Dependency Injection (optionaler _transporter-Parameter) statt
 *   mock.module, damit kein experimenteller Flag benötigt wird.
 * @module tests/email-service.test
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { sendFeedbackNotification } from "../src/services/email-service.js";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/**
 * Setzt Env-Variablen temporär und stellt sie nach dem Test wieder her.
 * Verwendet delete für undefined-Werte (process.env[k] = undefined würde
 * den String "undefined" setzen).
 */
const withEnv = (vars, fn) => async () => {
  const original = {};
  for (const [k, v] of Object.entries(vars)) {
    original[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = String(v);
    }
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

/** Erstellt einen Fake-Transporter der sendMail aufzeichnet. */
const fakeTransporter = () => {
  let captured = null;
  return {
    sendMail: async (options) => {
      captured = options;
    },
    getCaptured: () => captured,
  };
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("sendFeedbackNotification", () => {
  afterEach(() => {
    // Env-Cleanup falls ein Test das vergisst
  });

  it(
    "überspringt Senden wenn SMTP_PASS nicht gesetzt ist",
    withEnv(
      {
        SMTP_PASS: undefined,
        TO_EMAIL: "to@example.com",
        FROM_EMAIL: "from@example.com",
      },
      async () => {
        const t = fakeTransporter();
        await sendFeedbackNotification({ type: "bug", description: "Test" }, t);
        assert.equal(
          t.getCaptured(),
          null,
          "sendMail darf nicht aufgerufen werden",
        );
      },
    ),
  );

  it(
    "überspringt Senden wenn TO_EMAIL nicht gesetzt ist",
    withEnv(
      {
        SMTP_PASS: "secret",
        TO_EMAIL: undefined,
        FROM_EMAIL: "from@example.com",
      },
      async () => {
        const t = fakeTransporter();
        await sendFeedbackNotification({ type: "bug", description: "Test" }, t);
        assert.equal(
          t.getCaptured(),
          null,
          "sendMail darf nicht aufgerufen werden",
        );
      },
    ),
  );

  it(
    "Subject enthält den Feedback-Typ als Label",
    withEnv(
      {
        SMTP_PASS: "secret",
        SMTP_USER: "from@gmail.com",
        TO_EMAIL: "to@example.com",
        FROM_EMAIL: "from@gmail.com",
      },
      async () => {
        const t = fakeTransporter();
        await sendFeedbackNotification(
          { type: "improvement", description: "Dark Mode wäre schön." },
          t,
        );
        assert.ok(t.getCaptured(), "sendMail muss aufgerufen worden sein");
        assert.match(t.getCaptured().subject, /Verbesserungsvorschlag/);
      },
    ),
  );

  it(
    "E-Mail des Nutzers erscheint im Text wenn angegeben",
    withEnv(
      {
        SMTP_PASS: "secret",
        SMTP_USER: "from@gmail.com",
        TO_EMAIL: "to@example.com",
        FROM_EMAIL: "from@gmail.com",
      },
      async () => {
        const t = fakeTransporter();
        await sendFeedbackNotification(
          {
            type: "bug",
            description: "Login crasht.",
            email: "nutzer@example.com",
          },
          t,
        );
        assert.ok(t.getCaptured()?.text.includes("nutzer@example.com"));
      },
    ),
  );

  it(
    "kein Absender-Feld im Text wenn keine Nutzer-Email angegeben",
    withEnv(
      {
        SMTP_PASS: "secret",
        SMTP_USER: "from@gmail.com",
        TO_EMAIL: "to@example.com",
        FROM_EMAIL: "from@gmail.com",
      },
      async () => {
        const t = fakeTransporter();
        await sendFeedbackNotification(
          { type: "other", description: "Sonstiges." },
          t,
        );
        assert.ok(!t.getCaptured()?.text.includes("Antwort an:"));
      },
    ),
  );
});
