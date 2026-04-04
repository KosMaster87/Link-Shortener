/**
 * @fileoverview E2E-Tests für den Dashboard Auth-Guard
 * @description Prüft, dass alle /api/dashboard/-Endpoints ohne Token 401
 *   zurückgeben und mit gültigem Token 200. Echte HTTP-Requests gegen
 *   localhost:3000 – kein Mocking.
 *
 *   Voraussetzung: Server muss laufen (`npm start`).
 *
 * @module tests/dashboard-auth.test
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, describe, it } from "node:test";
import { pool } from "../src/db/index.js";

const BASE = "http://localhost:3000";

const createdUserEmails = [];

/**
 * Registriert einen Wegwerf-User und gibt token zurück.
 * @returns {Promise<string>} JWT-Token
 */
const registerAndLogin = async () => {
  const email = `dashboard-auth-${randomUUID()}@example.com`;
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestPass123" }),
  });
  assert.equal(res.status, 201);
  createdUserEmails.push(email);
  const { token } = await res.json();
  return token;
};

afterEach(async () => {
  if (createdUserEmails.length > 0) {
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [
      createdUserEmails,
    ]);
    createdUserEmails.length = 0;
  }
});

after(async () => {
  await pool.end();
});

// ─── Auth-Guard: 401 ohne Token ───────────────────────────────────────────────

describe("GET /api/dashboard/* – ohne Token", () => {
  // Jeder Dashboard-Endpoint muss 401 zurückgeben, wenn kein Token mitgeschickt
  // wird. Ohne diesen Test wäre ein versehentliches Entfernen des checkAuth-Aufrufs
  // in server.js ein stiller Bug – öffentlich zugängliche Admin-Daten.
  it("GET /api/dashboard/overview → 401", async () => {
    const res = await fetch(`${BASE}/api/dashboard/overview`);
    assert.equal(res.status, 401);
  });

  it("GET /api/dashboard/top-links → 401", async () => {
    const res = await fetch(`${BASE}/api/dashboard/top-links`);
    assert.equal(res.status, 401);
  });

  it("GET /api/dashboard/clicks-per-day → 401", async () => {
    const res = await fetch(`${BASE}/api/dashboard/clicks-per-day`);
    assert.equal(res.status, 401);
  });

  it("GET /api/dashboard/referrer/:code → 401", async () => {
    const res = await fetch(`${BASE}/api/dashboard/referrer/abc123`);
    assert.equal(res.status, 401);
  });
});

// ─── Auth-Guard: 200 mit gültigem Token ──────────────────────────────────────

describe("GET /api/dashboard/* – mit gültigem Token", () => {
  // Wir prüfen nur den Status, nicht den Body – der Service-Layer hat eigene
  // Unit-Tests. Hier geht es ausschließlich um den Auth-Guard-Durchlass.
  it("GET /api/dashboard/overview → 200", async () => {
    const token = await registerAndLogin();
    const res = await fetch(`${BASE}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
  });

  it("GET /api/dashboard/top-links → 200", async () => {
    const token = await registerAndLogin();
    const res = await fetch(`${BASE}/api/dashboard/top-links`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
  });

  it("GET /api/dashboard/clicks-per-day → 200", async () => {
    const token = await registerAndLogin();
    const res = await fetch(`${BASE}/api/dashboard/clicks-per-day`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
  });

  // Ungültiger Code → 404, aber Auth-Guard wurde passiert (kein 401).
  // Dieser Test stellt sicher, dass der Guard nicht durch 404-Responses umgangen
  // werden kann (Defense-in-depth: erst Auth, dann Routing).
  it("GET /api/dashboard/referrer/unbekannt → 404, nicht 401", async () => {
    const token = await registerAndLogin();
    const res = await fetch(`${BASE}/api/dashboard/referrer/unbekannt`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.notEqual(res.status, 401);
    assert.equal(res.status, 404);
  });
});

// ─── Fehlerhafter Token ───────────────────────────────────────────────────────

describe("GET /api/dashboard/* – mit ungültigem Token", () => {
  // Ein manipulierter Token darf keinen Zugang gewähren.
  // requireAuth prüft Signatur – ein gefälschtes Payload schlägt fehl.
  it("GET /api/dashboard/overview mit gefälschtem Token → 401", async () => {
    const res = await fetch(`${BASE}/api/dashboard/overview`, {
      headers: { Authorization: "Bearer gefaelschter.token.wert" },
    });
    assert.equal(res.status, 401);
  });
});
