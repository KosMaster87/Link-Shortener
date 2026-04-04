/**
 * @fileoverview Integrationstests für getClicksByPeriod
 * @description Testet Zeitreihen-Aggregation mit Perioden (day/week/month)
 *   gegen die echte Datenbank. Klicks verschiedener Wochen/Monate werden per
 *   Raw-SQL mit explizitem clicked_at eingefügt, da trackClick keinen
 *   Timestamp-Override unterstützt.
 * @module tests/analytics-period.test
 */
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { pool } from "../src/db/index.js";
import {
  getClicksByPeriod,
  trackClick,
} from "../src/services/analytics-service.js";
import { createLink } from "../src/services/link-service.js";

let testCode;

beforeEach(async () => {
  const result = await createLink({ url: "https://example.com/period-test" });
  testCode = result.data.code;
});

afterEach(async () => {
  await pool.query("DELETE FROM link_clicks WHERE code = $1", [testCode]);
  await pool.query("DELETE FROM short_links WHERE code = $1", [testCode]);
});

after(async () => {
  await pool.end();
});

// ─── Leeres Ergebnis ──────────────────────────────────────────────────────────

describe("getClicksByPeriod – leeres Ergebnis", () => {
  // Ein Link ohne Klicks soll ein leeres Array zurückgeben, nicht null oder Fehler.
  // Warum: Das Frontend rendert für neue Links — ein Crash oder null wäre ein UX-Bug.
  it("gibt leeres Array zurück wenn keine Klicks vorhanden", async () => {
    const result = await getClicksByPeriod(testCode, "day");

    assert.equal(result.success, true);
    assert.deepEqual(result.data, []);
  });
});

// ─── period=day ───────────────────────────────────────────────────────────────

describe("getClicksByPeriod – period=day", () => {
  // AGGREGATION: Zwei Klicks am selben Tag sollen zu einem Eintrag gebündelt
  // werden. Ohne GROUP BY würden 2 Einträge zurückkommen — dieser Test erkennt
  // fehlende oder falsche DATE_TRUNC-Logik sofort.
  it("Klicks desselben Tages werden zu einem Eintrag aggregiert", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mozilla/5.0",
      ip: "1.1.1.1",
    });
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mozilla/5.0",
      ip: "2.2.2.2",
    });

    const result = await getClicksByPeriod(testCode, "day");

    assert.equal(result.success, true);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].count, 2);
  });

  // FORMAT: period_start muss als YYYY-MM-DD zurückkommen, nicht als JS-Date-Objekt.
  // Der pg-Treiber wandelt DATE-Typ automatisch in Date-Objekte um — TO_CHAR
  // verhindert das. Ohne diesen Test bliebe ein Refactor zu ::date unbemerkt
  // bis ein Frontend-Bug gemeldet wird.
  it("period_start hat Format YYYY-MM-DD", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mozilla/5.0",
      ip: "1.1.1.1",
    });

    const result = await getClicksByPeriod(testCode, "day");

    assert.match(result.data[0].period_start, /^\d{4}-\d{2}-\d{2}$/);
  });

  // VERSCHIEDENE TAGE: Klicks aus verschiedenen Tagen müssen getrennte Einträge
  // erzeugen. trackClick setzt clicked_at=NOW() — ältere Klicks via Raw-SQL.
  it("Klicks verschiedener Tage erscheinen als separate Einträge", async () => {
    await pool.query(
      `INSERT INTO link_clicks (code, referrer, ip_hash, is_bot, clicked_at)
       VALUES ($1, 'Direct', 'hash-day-1', FALSE, NOW()),
              ($1, 'Direct', 'hash-day-2', FALSE, NOW() - INTERVAL '2 days')`,
      [testCode],
    );

    const result = await getClicksByPeriod(testCode, "day");

    assert.equal(result.success, true);
    assert.equal(result.data.length, 2);
  });
});

// ─── period=week ──────────────────────────────────────────────────────────────

describe("getClicksByPeriod – period=week", () => {
  // WOCHENGRUPPIERUNG: Klicks in derselben Woche → 1 Eintrag.
  // DATE_TRUNC('week', ...) gibt den Montag der Woche zurück (ISO-Standard).
  it("Klicks derselben Woche werden zu einem Eintrag aggregiert", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mozilla/5.0",
      ip: "1.1.1.1",
    });
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mozilla/5.0",
      ip: "2.2.2.2",
    });

    const result = await getClicksByPeriod(testCode, "week");

    assert.equal(result.success, true);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].count, 2);
  });

  // VERSCHIEDENE WOCHEN: 14 Tage Abstand → 2 separate Wocheneinträge.
  // Stellt sicher dass DATE_TRUNC('week') korrekt trennt, nicht DATE_TRUNC('month').
  it("Klicks verschiedener Wochen erscheinen als separate Einträge", async () => {
    await pool.query(
      `INSERT INTO link_clicks (code, referrer, ip_hash, is_bot, clicked_at)
       VALUES ($1, 'Direct', 'hash-week-1', FALSE, NOW()),
              ($1, 'Direct', 'hash-week-2', FALSE, NOW() - INTERVAL '14 days')`,
      [testCode],
    );

    const result = await getClicksByPeriod(testCode, "week");

    assert.equal(result.success, true);
    assert.equal(result.data.length, 2);
  });
});

// ─── period=month ─────────────────────────────────────────────────────────────

describe("getClicksByPeriod – period=month", () => {
  // MONATSGRUPPIERUNG: Klicks im selben Monat → 1 Eintrag.
  it("Klicks desselben Monats werden zu einem Eintrag aggregiert", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mozilla/5.0",
      ip: "1.1.1.1",
    });
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mozilla/5.0",
      ip: "2.2.2.2",
    });

    const result = await getClicksByPeriod(testCode, "month");

    assert.equal(result.success, true);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].count, 2);
  });

  // VERSCHIEDENE MONATE: 40 Tage Abstand → immer 2 verschiedene Monate.
  it("Klicks verschiedener Monate erscheinen als separate Einträge", async () => {
    await pool.query(
      `INSERT INTO link_clicks (code, referrer, ip_hash, is_bot, clicked_at)
       VALUES ($1, 'Direct', 'hash-month-1', FALSE, NOW()),
              ($1, 'Direct', 'hash-month-2', FALSE, NOW() - INTERVAL '40 days')`,
      [testCode],
    );

    const result = await getClicksByPeriod(testCode, "month");

    assert.equal(result.success, true);
    assert.equal(result.data.length, 2);
  });
});

// ─── Bot-Filter ───────────────────────────────────────────────────────────────

describe("getClicksByPeriod – Bot-Filter", () => {
  // BOTS AUSBLENDEN: Ein Bot-Klick und ein Human-Klick am selben Tag.
  // Das Ergebnis darf nur count=1 zeigen — is_bot=FALSE greift in der Query.
  // Wäre das Filter-Prädikat entfernt, würde count=2 erscheinen.
  it("Bot-Klicks werden aus der Aggregation ausgeblendet", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Googlebot/2.1",
      ip: "66.249.64.1",
    });
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mozilla/5.0",
      ip: "1.2.3.4",
    });

    const result = await getClicksByPeriod(testCode, "day");

    assert.equal(result.success, true);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].count, 1);
  });

  // NUR BOTS: Wenn alle Klicks Bot-Klicks sind, muss das Ergebnis leer sein.
  it("gibt leeres Array zurück wenn alle Klicks Bot-Klicks sind", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Googlebot/2.1",
      ip: "66.249.64.1",
    });

    const result = await getClicksByPeriod(testCode, "day");

    assert.equal(result.success, true);
    assert.deepEqual(result.data, []);
  });
});

// ─── Fehlerfälle ──────────────────────────────────────────────────────────────

describe("getClicksByPeriod – Fehlerfälle", () => {
  // NOT_FOUND: Unbekannter Code soll NOT_FOUND zurückgeben, keinen DB-Fehler.
  it("gibt err('NOT_FOUND') für unbekannten Code", async () => {
    const result = await getClicksByPeriod("xxxxxx", "day");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "NOT_FOUND");
  });

  // INVALID_INPUT: "year" ist keine erlaubte Periode — Validation greift vor
  // dem DB-Zugriff. Stellt sicher dass kein unkontrollierter SQL-Parameter
  // an DATE_TRUNC übergeben wird.
  it("gibt err('INVALID_INPUT') für period='year'", async () => {
    const result = await getClicksByPeriod(testCode, "year");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "INVALID_INPUT");
  });

  // INVALID_INPUT: Leerer String ist ebenfalls ungültig.
  it("gibt err('INVALID_INPUT') für period=''", async () => {
    const result = await getClicksByPeriod(testCode, "");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "INVALID_INPUT");
  });
});
