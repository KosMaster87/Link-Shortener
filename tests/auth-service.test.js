/**
 * @fileoverview Integrationstests für auth-service
 * @description Testet register und login gegen die echte Datenbank.
 *   Kein Mocking – so sehen wir reale Fehler bei Schema-Änderungen oder
 *   Passwort-Hash-Korruption.
 * @module tests/auth-service.test
 */
import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { pool } from "../src/db/index.js";
import { login, register } from "../src/services/auth-service.js";

const createdEmails = [];

afterEach(async () => {
  if (createdEmails.length > 0) {
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [
      createdEmails,
    ]);
    createdEmails.length = 0;
  }
});

after(() => pool.end());

// ─── register ────────────────────────────────────────────────────────────────

describe("register", () => {
  it("legt einen neuen User an und gibt id + email zurück", async () => {
    const email = `reg-test-${Date.now()}@example.com`;
    const result = await register(email, "Sicher123!");
    createdEmails.push(email);

    assert.equal(result.success, true);
    assert.equal(typeof result.data.id, "string");
    assert.equal(result.data.email, email.toLowerCase());
  });

  it("gibt INVALID_INPUT zurück bei ungültiger E-Mail", async () => {
    const result = await register("kein-at-zeichen", "Sicher123!");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "INVALID_INPUT");
  });

  it("gibt INVALID_INPUT zurück bei zu kurzem Passwort", async () => {
    const result = await register("valid@example.com", "kurz");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "INVALID_INPUT");
  });

  // EMAIL_TAKEN: Zweite Registrierung mit derselben E-Mail muss scheitern.
  // Prüft den DB-Uniqueness-Constraint-Pfad (e.code === "23505").
  it("gibt EMAIL_TAKEN zurück wenn E-Mail bereits vergeben", async () => {
    const email = `dup-${Date.now()}@example.com`;
    await register(email, "Sicher123!");
    createdEmails.push(email);

    const second = await register(email, "AnderesPW99");

    assert.equal(second.success, false);
    assert.equal(second.error.code, "EMAIL_TAKEN");
  });
});

// ─── login ───────────────────────────────────────────────────────────────────

describe("login", () => {
  it("gibt User zurück bei korrekten Anmeldedaten", async () => {
    const email = `login-ok-${Date.now()}@example.com`;
    await register(email, "Sicher123!");
    createdEmails.push(email);

    const result = await login(email, "Sicher123!");

    assert.equal(result.success, true);
    assert.equal(result.data.email, email.toLowerCase());
    assert.equal(typeof result.data.id, "string");
  });

  it("gibt INVALID_CREDENTIALS zurück bei falschem Passwort", async () => {
    const email = `login-wrong-${Date.now()}@example.com`;
    await register(email, "Sicher123!");
    createdEmails.push(email);

    const result = await login(email, "FalschesPasswort!");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "INVALID_CREDENTIALS");
  });

  it("gibt INVALID_CREDENTIALS zurück bei unbekannter E-Mail", async () => {
    const result = await login("niemals@registriert.de", "Sicher123!");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "INVALID_CREDENTIALS");
  });

  it("gibt INVALID_CREDENTIALS zurück bei ungültigem E-Mail-Format", async () => {
    const result = await login("kein-at", "Sicher123!");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "INVALID_CREDENTIALS");
  });

  // SECURITY: Korrupter password_hash in der DB (kein ":"-Trennzeichen) darf
  // den Server nicht crashen. verifyPassword muss false zurückgeben statt zu werfen.
  // Sichert den Critical-Fix für Buffer-Length-Mismatch in timingSafeEqual ab.
  it("gibt INVALID_CREDENTIALS zurück wenn password_hash in der DB korrupt ist", async () => {
    const email = `corrupt-hash-${Date.now()}@example.com`;
    await register(email, "Sicher123!");
    createdEmails.push(email);

    // password_hash direkt in der DB korrumpieren (kein ":"-Separator)
    await pool.query("UPDATE users SET password_hash = $1 WHERE email = $2", [
      "KORRUPTER_HASH_OHNE_DOPPELPUNKT",
      email.toLowerCase(),
    ]);

    const result = await login(email, "Sicher123!");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "INVALID_CREDENTIALS");
  });

  // SECURITY: Abgeschnittener Hash-Teil führt zu Buffer-Length-Mismatch.
  // timingSafeEqual würde ohne den Fix ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH werfen.
  it("gibt INVALID_CREDENTIALS zurück wenn hash-Teil des password_hash verkürzt ist", async () => {
    const email = `short-hash-${Date.now()}@example.com`;
    await register(email, "Sicher123!");
    createdEmails.push(email);

    // Valides salt:hash-Format, aber hash ist nur 4 Zeichen statt 128
    await pool.query("UPDATE users SET password_hash = $1 WHERE email = $2", [
      "aabbccdd:abcd",
      email.toLowerCase(),
    ]);

    const result = await login(email, "Sicher123!");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "INVALID_CREDENTIALS");
  });
});
