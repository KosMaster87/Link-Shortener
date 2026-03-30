/**
 * @fileoverview Integrationstests für link-service
 * @description Testet createLink, getLink und deleteLink gegen die echte
 *   Datenbank. Keine Mocks – so finden wir echte SQL-Fehler und
 *   Schema-Probleme, die gemockte Tests verstecken würden.
 * @module tests/link-service.test
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, describe, it } from "node:test";
import { pool } from "../src/db/index.js";
import {
  createLink,
  deleteLink,
  getInactiveLinks,
  getLink,
  toggleActive,
  updateLink,
} from "../src/services/link-service.js";

// Sammelt alle Codes, die ein Test anlegt – afterEach räumt sie weg.
// Warum: Jeder Test soll auf einem sauberen Zustand aufbauen, damit
// Testergebnisse nicht von der Reihenfolge der Ausführung abhängen.
const createdCodes = [];
const createdUserIds = [];

afterEach(async () => {
  if (createdCodes.length > 0) {
    await pool.query("DELETE FROM short_links WHERE code = ANY($1)", [
      createdCodes,
    ]);
    createdCodes.length = 0;
  }
  if (createdUserIds.length > 0) {
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [createdUserIds]);
    createdUserIds.length = 0;
  }
});

// Verbindung schließen, damit der Node-Prozess sauber beendet wird.
// Ohne pool.end() hängt der Test-Runner nach dem letzten Test.
after(() => pool.end());

// ─── createLink ──────────────────────────────────────────────────────────────

describe("createLink", () => {
  // HAPPY PATH: Wir prüfen nicht nur success, sondern auch die Struktur des
  // zurückgegebenen Objekts. So erkennen wir sofort, wenn ein DB-Feld umbenennt
  // oder toLink() falsch mappt.
  it("gibt ein Link-Objekt zurück bei gültiger URL", async () => {
    const result = await createLink({ url: "https://example.com" });
    // console.log("🔍 DB zurückgegeben:", JSON.stringify(result, null, 2));
    createdCodes.push(result.data.code);

    assert.equal(result.success, true);
    assert.equal(typeof result.data.code, "string");
    assert.equal(result.data.code.length, 6);
    assert.equal(result.data.originalUrl, "https://example.com");
    assert.ok(result.data.createdAt instanceof Date);
  });

  // FEHLERFALL ungültige URL: Der Service soll Müll-Eingaben abweisen, bevor
  // sie die DB erreichen. Wir testen einen String ohne Protokoll, weil das
  // der häufigste Tippfehler von Nutzern ist.
  it("gibt err('INVALID_URL') zurück bei URL ohne Protokoll", async () => {
    const result = await createLink({ url: "example.com" });

    assert.equal(result.success, false);
    assert.equal(result.error.code, "INVALID_URL");
  });

  // CUSTOM ALIAS: Wir verifizieren, dass der zurückgegebene code exakt dem
  // übergebenen Alias entspricht – nicht nur, dass kein Fehler auftritt.
  it("verwendet den Custom Alias als code", async () => {
    const result = await createLink({
      url: "https://example.com",
      alias: "mein-link",
    });
    createdCodes.push(result.data.code);

    assert.equal(result.success, true);
    assert.equal(result.data.code, "mein-link");
  });

  // RESERVED WORD: Wir testen 'api' stellvertretend für alle reserved words.
  // Ein separater Unit-Test der RESERVED-Liste wäre overkill – es reicht zu
  // prüfen, dass der Mechanismus überhaupt greift.
  it("gibt err('SLUG_TAKEN') zurück bei reserviertem Alias", async () => {
    const result = await createLink({
      url: "https://example.com",
      alias: "api",
    });

    assert.equal(result.success, false);
    assert.equal(result.error.code, "SLUG_TAKEN");
  });

  // ALIAS KOLLISION: Wir legen denselben Alias zweimal an. Der erste muss
  // klappen, der zweite muss scheitern. So testen wir den DB-Uniqueness-Pfad
  // – getrennt vom Reserved-Words-Pfad, der nie die DB erreicht.
  it("gibt err('SLUG_TAKEN') zurück wenn Alias bereits vergeben", async () => {
    const first = await createLink({
      url: "https://example.com",
      alias: "doppelt",
    });
    createdCodes.push(first.data.code);

    const second = await createLink({
      url: "https://other.com",
      alias: "doppelt",
    });

    assert.equal(first.success, true);
    assert.equal(second.success, false);
    assert.equal(second.error.code, "SLUG_TAKEN");
  });
});

// ─── getLink ─────────────────────────────────────────────────────────────────

describe("getLink", () => {
  // HAPPY PATH: Erst anlegen, dann abrufen. So stellen wir sicher, dass
  // createLink und getLink konsistent denselben code verwenden und toLink()
  // auf beiden Seiten identisch mappt.
  it("gibt den Link zurück bei bekanntem code", async () => {
    const created = await createLink({ url: "https://example.com/get" });
    createdCodes.push(created.data.code);

    const result = await getLink(created.data.code);

    assert.equal(result.success, true);
    assert.equal(result.data.code, created.data.code);
    assert.equal(result.data.originalUrl, "https://example.com/get");
  });

  // FEHLERFALL: Ein zufälliger Code, der mit Sicherheit nicht in der DB ist.
  // Wir prüfen explizit den error-String, damit eine Änderung der Fehlercodes
  // sofort auffällt – NOT_FOUND vs. NOTFOUND vs. not_found wären alle Bugs.
  it("gibt err('NOT_FOUND') zurück bei unbekanntem code", async () => {
    const result = await getLink("xxxxxx");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "NOT_FOUND");
  });
});

// ─── updateLink ──────────────────────────────────────────────────────────────

describe("updateLink", () => {
  // HAPPY PATH: Wir prüfen nicht nur success, sondern auch dass originalUrl
  // tatsächlich den neuen Wert trägt. So erkennen wir, wenn das UPDATE zwar
  // läuft, aber RETURNING einen veralteten Stand zurückgibt.
  it("aktualisiert die URL eines bestehenden Links", async () => {
    const created = await createLink({ url: "https://example.com/alt" });
    createdCodes.push(created.data.code);

    const result = await updateLink(
      created.data.code,
      "https://example.com/neu",
    );

    assert.equal(result.success, true);
    assert.equal(result.data.originalUrl, "https://example.com/neu");
    assert.equal(result.data.code, created.data.code);
  });

  // FEHLERFALL unbekannter Code: Wir übergeben einen Code, der nie in der DB
  // existiert hat. Ohne diesen Test könnten wir stille Null-Updates übersehen.
  it("gibt err('NOT_FOUND') zurück für unbekannten Code", async () => {
    const result = await updateLink("xxxxxx", "https://example.com");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "NOT_FOUND");
  });

  // FEHLERFALL ungültige URL: Die Validierung soll vor dem DB-Zugriff greifen.
  // Wir testen einen String ohne Protokoll – gleicher Eingabetyp wie in createLink,
  // damit das Verhalten beider Funktionen konsistent bleibt.
  it("gibt err('INVALID_URL') zurück für ungültige URL", async () => {
    const created = await createLink({ url: "https://example.com/check" });
    createdCodes.push(created.data.code);

    const result = await updateLink(created.data.code, "kein-protokoll.de");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "INVALID_URL");
  });
});

// ─── toggleActive ─────────────────────────────────────────────────────────────

describe("toggleActive", () => {
  // TRUE → FALSE: Neue Links haben is_active = true per DB-Default.
  // Der erste Toggle muss also false liefern – wir prüfen den konkreten Wert,
  // nicht nur success, damit ein versehentlicher SET statt NOT-Operator auffällt.
  it("schaltet is_active von true auf false", async () => {
    const created = await createLink({ url: "https://example.com/toggle1" });
    createdCodes.push(created.data.code);

    const result = await toggleActive(created.data.code);

    assert.equal(result.success, true);
    assert.equal(result.data.isActive, false);
  });

  // FALSE → TRUE: Wir togglen zweimal, um den Rückweg zu testen. Ein einfaches
  // SET TRUE würde diesen Test bestehen – nur NOT is_active besteht beide Richtungen.
  it("schaltet is_active von false auf true", async () => {
    const created = await createLink({ url: "https://example.com/toggle2" });
    createdCodes.push(created.data.code);

    await toggleActive(created.data.code);
    const result = await toggleActive(created.data.code);

    assert.equal(result.success, true);
    assert.equal(result.data.isActive, true);
  });

  // FEHLERFALL: Identisch zum NOT_FOUND-Muster in getLink und deleteLink –
  // konsistentes Verhalten über alle Funktionen soll explizit sichtbar sein.
  it("gibt err('NOT_FOUND') zurück für unbekannten Code", async () => {
    const result = await toggleActive("xxxxxx");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "NOT_FOUND");
  });
});

// ─── getInactiveLinks ────────────────────────────────────────────────────────

describe("getInactiveLinks", () => {
  // LINKS OHNE KLICKS: Der häufigste Inaktiv-Fall – der Link wurde angelegt,
  // aber nie aufgerufen. LEFT JOIN muss diese Zeile trotzdem liefern.
  it("gibt Links ohne Klick-Einträge zurück", async () => {
    const created = await createLink({ url: "https://example.com/inactive" });
    createdCodes.push(created.data.code);

    const result = await getInactiveLinks(7);

    assert.equal(result.success, true);
    const codes = result.data.map((l) => l.code);
    assert.ok(codes.includes(created.data.code));
  });

  // KLICK IM ZEITRAUM: Link hat einen frischen Klick – darf nicht auftauchen.
  // Wir schreiben den Klick direkt in die DB, da kein insertClick-Export existiert.
  it("schließt Links mit Klick im Zeitraum aus", async () => {
    const created = await createLink({ url: "https://example.com/active" });
    createdCodes.push(created.data.code);
    await pool.query(
      "INSERT INTO link_clicks (code, clicked_at) VALUES ($1, NOW())",
      [created.data.code],
    );

    const result = await getInactiveLinks(7);

    assert.equal(result.success, true);
    const codes = result.data.map((l) => l.code);
    assert.ok(!codes.includes(created.data.code));
  });

  // ALTER KLICK AUSSERHALB DES ZEITRAUMS: Der Link hatte Klicks, aber vor über
  // 7 Tagen. Er gilt als inaktiv und muss im Ergebnis erscheinen.
  it("gibt Links zurück deren letzter Klick außerhalb des Zeitraums liegt", async () => {
    const created = await createLink({ url: "https://example.com/old-click" });
    createdCodes.push(created.data.code);
    await pool.query(
      "INSERT INTO link_clicks (code, clicked_at) VALUES ($1, NOW() - INTERVAL '8 days')",
      [created.data.code],
    );

    const result = await getInactiveLinks(7);

    assert.equal(result.success, true);
    const codes = result.data.map((l) => l.code);
    assert.ok(codes.includes(created.data.code));
  });

  // LEERE DATENBANK: afterEach räumt alle Links weg – nach einem isolierten
  // Test ohne eigene Links gibt getInactiveLinks für einen frischen User ein
  // leeres Array zurück, unabhängig von Fremddaten in der Entwicklungs-DB.
  it("gibt leeres Array zurück wenn keine Links existieren", async () => {
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [`inactive-${randomUUID()}@example.com`, "test-hash"],
    );
    createdUserIds.push(rows[0].id);
    const result = await getInactiveLinks(7, rows[0].id);

    assert.equal(result.success, true);
    assert.equal(result.data.length, 0);
  });

  // UNGÜLTIGE DAYS-WERTE: Alle drei Fälle prüfen denselben Validierungspfad –
  // 0, negative Zahl und Float dürfen nie die DB erreichen.
  it("gibt err('INVALID_DAYS') zurück für days = 0", async () => {
    const result = await getInactiveLinks(0);

    assert.equal(result.success, false);
    assert.equal(result.error.code, "INVALID_DAYS");
  });

  it("gibt err('INVALID_DAYS') zurück für negative Zahl", async () => {
    const result = await getInactiveLinks(-3);

    assert.equal(result.success, false);
    assert.equal(result.error.code, "INVALID_DAYS");
  });

  it("gibt err('INVALID_DAYS') zurück für Float", async () => {
    const result = await getInactiveLinks(1.5);

    assert.equal(result.success, false);
    assert.equal(result.error.code, "INVALID_DAYS");
  });
});

// ─── deleteLink ──────────────────────────────────────────────────────────────

describe("deleteLink", () => {
  // LÖSCHEN + VERIFIZIEREN: Wir prüfen nicht nur das Result von deleteLink,
  // sondern rufen danach getLink auf. Dieser "End-to-End"-Check innerhalb des
  // Service stellt sicher, dass der DELETE wirklich committed wurde und nicht
  // z.B. durch einen Fehler im RETURNING-Ausdruck maskiert wird.
  it("löscht den Link – danach gibt getLink NOT_FOUND zurück", async () => {
    const created = await createLink({ url: "https://example.com/delete" });
    const code = created.data.code;

    const deleteResult = await deleteLink(code);
    assert.equal(deleteResult.success, true);

    const afterDelete = await getLink(code);
    assert.equal(afterDelete.success, false);
    assert.equal(afterDelete.error.code, "NOT_FOUND");
    // code nicht in createdCodes pushen – der Link ist bereits gelöscht
  });
});
