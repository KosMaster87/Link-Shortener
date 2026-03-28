/**
 * @fileoverview Integrationstests für analytics-service
 * @description Testet trackClick und getStats gegen die echte Datenbank.
 *   Keine Mocks – so finden wir echte SQL-Fehler und Schema-Probleme,
 *   die gemockte Tests verstecken würden.
 *
 *   Voraussetzung: link_clicks braucht eine ip_hash-Spalte:
 *   ALTER TABLE link_clicks ADD COLUMN ip_hash TEXT;
 *   ALTER TABLE link_clicks ADD COLUMN is_bot BOOLEAN NOT NULL DEFAULT FALSE;
 *
 * @module tests/analytics-service.test
 */
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { pool } from "../src/db/index.js";
import { getStats, trackClick } from "../src/services/analytics-service.js";
import { createLink } from "../src/services/link-service.js";

// Isolation: Jeder Test bekommt seinen eigenen Link via beforeEach.
// Warum nicht before()? npm test führt alle Test-Dateien parallel aus.
// e2e-redirect.test.js bereinigt in afterEach die gesamte short_links-Tabelle –
// ein shared testCode würde mitten in einem analytics-Test gelöscht werden
// → FK-Violation im nächsten trackClick-Aufruf.
// Mit beforeEach/afterEach ist jeder Test vollständig in sich geschlossen.
let testCode;

beforeEach(async () => {
  const result = await createLink({ url: "https://example.com/analytics" });
  testCode = result.data.code;
});

afterEach(async () => {
  // ON DELETE CASCADE löscht link_clicks automatisch mit – explizit für Klarheit.
  await pool.query("DELETE FROM link_clicks WHERE code = $1", [testCode]);
  await pool.query("DELETE FROM short_links WHERE code = $1", [testCode]);
});

after(async () => {
  await pool.end();
});

// ─── trackClick ──────────────────────────────────────────────────────────────

describe("trackClick", () => {
  // HAPPY PATH: Wir prüfen nicht nur success, sondern lesen den Klick
  // direkt aus der DB. So erkennen wir sofort, wenn Felder falsch gemappt
  // oder Werte transformiert werden (z.B. ip_hash nicht gesetzt).
  it("speichert Klick mit code, referrer und userAgent", async () => {
    const result = await trackClick({
      linkId: testCode,
      referrer: "https://twitter.com/user/status/123",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
      ip: "192.168.1.100",
    });

    assert.equal(result.success, true);

    const { rows } = await pool.query(
      "SELECT * FROM link_clicks WHERE code = $1",
      [testCode],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].referrer, "https://twitter.com/user/status/123");
    assert.equal(
      rows[0].user_agent,
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
    );
    // ip_hash muss gesetzt sein – aber nicht die originale IP
    assert.ok(rows[0].ip_hash);
    assert.notEqual(rows[0].ip_hash, "192.168.1.100");
  });

  // NULL-REFERRER → "Direct": Viele Links werden direkt aufgerufen (z.B. aus
  // E-Mails, Bookmarks). Ohne diesen Default wären diese Klicks in der
  // Statistik unsichtbar oder würden null-Werte produzieren.
  it("speichert fehlenden Referrer als 'Direct'", async () => {
    const result = await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mozilla/5.0 (Windows NT 10.0)",
      ip: "10.0.0.1",
    });

    assert.equal(result.success, true);

    const { rows } = await pool.query(
      "SELECT referrer FROM link_clicks WHERE code = $1",
      [testCode],
    );
    assert.equal(rows[0].referrer, "Direct");
  });

  // BOT-FILTER: Klicks von bekannten Bots sollen nicht in die Statistik
  // einfließen. Wir prüfen, dass der Klick entweder gar nicht gespeichert
  // wird oder is_bot = true gesetzt ist – beides verhindert Verfälschung.
  it("markiert Googlebot als Bot (trifft 'bot'-Pattern)", async () => {
    await trackClick({
      linkId: testCode,
      referrer: "https://google.com",
      userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)",
      ip: "66.249.64.1",
    });

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM link_clicks WHERE code = $1 AND is_bot = FALSE",
      [testCode],
    );
    assert.equal(rows[0].total, 0);
  });

  // TWITTERBOT: Marketing-Teams teilen Links auf Twitter. Der Preview-Bot
  // von Twitter soll nicht als Klick zählen. "bot"-Pattern greift hier.
  it("markiert Twitterbot als Bot", async () => {
    await trackClick({
      linkId: testCode,
      referrer: "https://t.co",
      userAgent: "Twitterbot/1.0",
      ip: "199.16.156.1",
    });

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM link_clicks WHERE code = $1 AND is_bot = FALSE",
      [testCode],
    );
    assert.equal(rows[0].total, 0);
  });

  // LINKEDINBOT: Gleicher Fall wie Twitter. "bot"-Pattern greift auch hier
  // (LinkedInBot → toLowerCase → "linkedinbot" enthält "bot").
  it("markiert LinkedInBot als Bot", async () => {
    await trackClick({
      linkId: testCode,
      referrer: "https://linkedin.com",
      userAgent:
        "LinkedInBot/1.0 (compatible; compatible; +http://www.linkedin.com)",
      ip: "108.174.10.1",
    });

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM link_clicks WHERE code = $1 AND is_bot = FALSE",
      [testCode],
    );
    assert.equal(rows[0].total, 0);
  });

  // FACEBOOKEXTERNALHIT: Der Preview-Crawler von Facebook enthält "bot" NICHT
  // im User-Agent. Das aktuelle BOT_PATTERNS greift hier nicht → roter Test.
  it("markiert facebookexternalhit als Bot", async () => {
    await trackClick({
      linkId: testCode,
      referrer: "https://facebook.com",
      userAgent:
        "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      ip: "66.220.149.1",
    });

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM link_clicks WHERE code = $1 AND is_bot = FALSE",
      [testCode],
    );
    assert.equal(rows[0].total, 0);
  });

  // LEERER REFERRER → "Direct": Ein leerer String "" ist nicht null, aber
  // semantisch identisch mit "kein Referrer". Ohne diesen Test wäre ein
  // Refactor von `referrer || DIRECT` zu `referrer ?? DIRECT` ein silent
  // breaking change – "" würde dann als eigener Referrer gespeichert.
  it("speichert leeren Referrer ('') als 'Direct'", async () => {
    await trackClick({
      linkId: testCode,
      referrer: "",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      ip: "5.5.5.5",
    });

    const { rows } = await pool.query(
      "SELECT referrer FROM link_clicks WHERE code = $1",
      [testCode],
    );
    assert.equal(rows[0].referrer, "Direct");
  });

  // UNGÜLTIGE LINK-ID: Der Service soll prüfen, ob der Link existiert.
  // Ohne diese Prüfung würde ein DB-Constraint-Fehler nach oben blubbern
  // statt einen sauberen Result-Fehler zurückzugeben.
  it("gibt err('NOT_FOUND') zurück für unbekannte linkId", async () => {
    const result = await trackClick({
      linkId: "xxxxxx",
      referrer: "https://example.com",
      userAgent: "Mozilla/5.0",
      ip: "1.2.3.4",
    });

    assert.equal(result.success, false);
    assert.equal(result.error.code, "NOT_FOUND");
  });

  // BUG #1 – NULL USER-AGENT: Requests ohne User-Agent-Header sind gültig
  // (curl, programmatische Clients). isBot() darf nicht mit toLowerCase() auf
  // null/undefined crashen – stattdessen wird der Klick als Nicht-Bot gezählt.
  it("stürzt nicht ab wenn userAgent null ist", async () => {
    const result = await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: null,
      ip: "1.2.3.4",
    });

    assert.equal(result.success, true);
  });

  // BUG #3 – LEERE IP: Eine leere IP würde zu hashIp("") → immer demselben
  // Hash führen. Alle Requests ohne IP wären dann ein einziger Unique Visitor –
  // ein stiller Datenfehler der nie als Exception sichtbar wird.
  it("gibt err('MISSING_IP') zurück wenn ip leer oder null ist", async () => {
    const emptyIp = await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mozilla/5.0",
      ip: "",
    });
    const nullIp = await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mozilla/5.0",
      ip: null,
    });

    assert.equal(emptyIp.success, false);
    assert.equal(emptyIp.error.code, "MISSING_IP");
    assert.equal(nullIp.success, false);
    assert.equal(nullIp.error.code, "MISSING_IP");
  });
});

// ─── bot detection – Pattern-Coverage ────────────────────────────────────────

// Jeder BOT_PATTERN-Eintrag braucht mindestens einen Test. "bot" und
// "externalhit" sind durch Googlebot/facebookexternalhit oben bereits abgedeckt.
// Dieser Block schließt die vier verbleibenden Pattern-Lücken.
//
// Außerdem: Case-Insensitivität und ein False-Positive-Test.
// Warum False-Positive? Ein zu breites Pattern (z.B. "spider" trifft
// "spider-man-fan.com" im Referrer, aber hier im UA) würde echten Traffic
// ausblenden. Der Test stellt sicher, dass ein normaler Browser-UA nie geblockt wird.

describe("bot detection – Pattern-Coverage", () => {
  // "crawler"-Pattern: DataForSeo-Crawler ist ein SEO-Audit-Bot.
  // Substring-Match greift auf "crawler" unabhängig von Position.
  it("markiert DataForSeo-Crawler als Bot (trifft 'crawler'-Pattern)", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "DataForSeo-Crawler/1.0 (+https://dataforseo.com)",
      ip: "5.188.210.1",
    });

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM link_clicks WHERE code = $1 AND is_bot = FALSE",
      [testCode],
    );
    assert.equal(rows[0].total, 0);
  });

  // "spider"-Pattern: Sogou ist die meistgenutzte chinesische Suchmaschine.
  // User-Agents dieser Bots enthalten oft "spider" statt "bot".
  it("markiert Sogou Spider als Bot (trifft 'spider'-Pattern)", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent:
        "Sogou web spider/4.0 (+http://www.sogou.com/docs/help/webmasters.htm#07)",
      ip: "220.181.108.1",
    });

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM link_clicks WHERE code = $1 AND is_bot = FALSE",
      [testCode],
    );
    assert.equal(rows[0].total, 0);
  });

  // "slurp"-Pattern: Yahoo Search Crawler. "Slurp" kommt in keinem
  // normalen Browser-UA vor – ein sehr gezieltes Pattern ohne False-Positive-Risiko.
  it("markiert Yahoo! Slurp als Bot (trifft 'slurp'-Pattern)", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent:
        "Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)",
      ip: "72.30.198.1",
    });

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM link_clicks WHERE code = $1 AND is_bot = FALSE",
      [testCode],
    );
    assert.equal(rows[0].total, 0);
  });

  // "mediapartners"-Pattern: Google AdSense Crawler. Dieser Bot besucht
  // Seiten, um Werbeanzeigen zu optimieren – kein echter Nutzer-Klick.
  it("markiert Mediapartners-Google als Bot (trifft 'mediapartners'-Pattern)", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mediapartners-Google/2.1",
      ip: "66.249.90.1",
    });

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM link_clicks WHERE code = $1 AND is_bot = FALSE",
      [testCode],
    );
    assert.equal(rows[0].total, 0);
  });

  // CASE-INSENSITIVITÄT: Ein Refactor von toLowerCase() auf direkten
  // String-Vergleich würde "GOOGLEBOT" nicht mehr filtern. Dieser Test
  // schützt vor diesem stillen Regression-Risiko.
  it("filtert Bot-User-Agent unabhängig von Groß-/Kleinschreibung", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "GOOGLEBOT/2.1",
      ip: "66.249.64.10",
    });

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM link_clicks WHERE code = $1 AND is_bot = FALSE",
      [testCode],
    );
    assert.equal(rows[0].total, 0);
  });

  // FALSE-POSITIVE-SCHUTZ: Ein typischer Chrome-UA enthält keines der
  // Bot-Pattern. Würde ein neues Pattern wie ".*" oder "mozilla" ergänzt,
  // fiele dieser Test sofort rot – bevor echter Traffic verloren geht.
  it("zählt normalen Chrome-Browser-UA als echten Klick (kein Bot)", async () => {
    await trackClick({
      linkId: testCode,
      referrer: "https://google.com",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      ip: "203.0.113.1",
    });

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM link_clicks WHERE code = $1 AND is_bot = FALSE",
      [testCode],
    );
    // Echte Klicks müssen zählbar bleiben – Bot-Filter darf nicht überfiltern.
    assert.equal(rows[0].total, 1);
  });
});

// ─── getStats ─────────────────────────────────────────────────────────────────

describe("getStats", () => {
  // LEERE STATS: Ein neuer Link ohne Klicks soll valide Statistiken zurückgeben,
  // keine Fehler oder null-Werte. Warum: Das Dashboard rendert auch für neue
  // Links – ein Crash hier wäre ein UX-Bug.
  it("gibt leere Statistiken für Link ohne Klicks zurück", async () => {
    const result = await getStats(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data.totalClicks, 0);
    assert.deepEqual(result.data.clicksByDay, []);
    assert.deepEqual(result.data.topReferrers, []);
    assert.equal(result.data.uniqueVisitors, 0);
  });

  // TOTAL CLICKS: Wir speichern eine bekannte Anzahl Klicks und prüfen die
  // Summe. Getrennt von clicksByDay, damit ein Fehler in der GROUP BY-Logik
  // den Zähler-Test nicht maskiert.
  // Zwei Klicks kommen von derselben IP – damit ist totalClicks=3, uniqueVisitors=2.
  // Ohne diesen Unterschied wäre ein versehentlicher Vertausch der beiden Felder
  // im Return-Objekt unsichtbar, weil beide Werte identisch wären.
  it("zählt totalClicks korrekt", async () => {
    await trackClick({
      linkId: testCode,
      referrer: "https://a.com",
      userAgent: "Mozilla/5.0",
      ip: "1.1.1.1",
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://b.com",
      userAgent: "Mozilla/5.0",
      ip: "1.1.1.1",
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://c.com",
      userAgent: "Mozilla/5.0",
      ip: "2.2.2.2",
    });

    const result = await getStats(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data.totalClicks, 3);
    // uniqueVisitors muss 2 sein – stellt sicher, dass totalClicks nicht
    // versehentlich den unique-Wert zurückgibt.
    assert.equal(result.data.uniqueVisitors, 2);
  });

  // TOP REFERRERS: Wir prüfen Sortierung und Aggregation. Zwei Klicks von
  // twitter.com, einer von github.com – twitter muss an erster Stelle stehen.
  it("aggregiert topReferrers absteigend nach Anzahl", async () => {
    await trackClick({
      linkId: testCode,
      referrer: "https://twitter.com",
      userAgent: "Mozilla/5.0",
      ip: "1.1.1.1",
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://twitter.com",
      userAgent: "Mozilla/5.0",
      ip: "2.2.2.2",
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://github.com",
      userAgent: "Mozilla/5.0",
      ip: "3.3.3.3",
    });

    const result = await getStats(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data.topReferrers[0].referrer, "https://twitter.com");
    assert.equal(result.data.topReferrers[0].count, 2);
    assert.equal(result.data.topReferrers[1].referrer, "https://github.com");
    assert.equal(result.data.topReferrers[1].count, 1);
  });

  // CLICKS BY DAY: Klicks desselben Tages sollen zu einem Eintrag aggregiert
  // werden. Wir legen mehrere Klicks an – alle landen heute – und erwarten
  // genau einen Eintrag in clicksByDay.
  it("gruppiert clicksByDay nach Datum (ein Eintrag pro Tag)", async () => {
    await trackClick({
      linkId: testCode,
      referrer: "https://a.com",
      userAgent: "Mozilla/5.0",
      ip: "1.1.1.1",
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://b.com",
      userAgent: "Mozilla/5.0",
      ip: "2.2.2.2",
    });

    const result = await getStats(testCode);

    assert.equal(result.success, true);
    // Beide Klicks sind heute → genau ein Tageseintrag
    assert.equal(result.data.clicksByDay.length, 1);
    assert.equal(result.data.clicksByDay[0].count, 2);
    // date ist ein ISO-Datumsstring (YYYY-MM-DD)
    assert.match(result.data.clicksByDay[0].date, /^\d{4}-\d{2}-\d{2}$/);
  });

  // UNIQUE VISITORS: Zwei Klicks von derselben IP sollen nur als ein
  // Unique Visitor zählen. Wir testen die Hash-Deduplizierung, nicht die
  // Rohdaten – so bleibt der Test gültig auch wenn sich das Hash-Verfahren
  // ändert, solange die Semantik (gleiche IP = 1 Visitor) stimmt.
  it("zählt uniqueVisitors anhand von ip_hash (gleiche IP = 1)", async () => {
    const sameIp = "192.168.0.1";
    await trackClick({
      linkId: testCode,
      referrer: "https://a.com",
      userAgent: "Mozilla/5.0",
      ip: sameIp,
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://b.com",
      userAgent: "Mozilla/5.0",
      ip: sameIp,
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://c.com",
      userAgent: "Mozilla/5.0",
      ip: "10.0.0.5",
    });

    const result = await getStats(testCode);

    assert.equal(result.success, true);
    // 3 Klicks, aber nur 2 unterschiedliche IPs
    assert.equal(result.data.uniqueVisitors, 2);
  });

  // IP-HASH DETERMINISMUS: Gleiche IP muss immer denselben Hash erzeugen –
  // das ist die stille Voraussetzung für COUNT(DISTINCT ip_hash). Ein Refactor
  // zu randomBytes() würde alle uniqueVisitors-Tests bestehen lassen, aber die
  // Semantik wäre kaputt. Wir prüfen direkt in der DB, nicht im Service.
  it("erzeugt für gleiche IP immer denselben ip_hash", async () => {
    const ip = "203.0.113.42";
    await trackClick({
      linkId: testCode,
      referrer: "https://a.com",
      userAgent: "Mozilla/5.0",
      ip,
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://b.com",
      userAgent: "Mozilla/5.0",
      ip,
    });

    const { rows } = await pool.query(
      "SELECT DISTINCT ip_hash FROM link_clicks WHERE code = $1",
      [testCode],
    );
    // Zwei Klicks, eine IP → genau ein eindeutiger Hash
    assert.equal(rows.length, 1);
    // Hash hat SHA-256-Format: 64 Hex-Zeichen
    assert.match(rows[0].ip_hash, /^[0-9a-f]{64}$/);
  });

  // BOT-KLICKS IN GETSTATS: trackClick markiert Bots mit is_bot=true.
  // getStats filtert per is_bot=FALSE. Dieser Test prüft die Verbindung
  // zwischen beiden Funktionen – ein fehlendes WHERE is_bot=FALSE in einer
  // der Aggregat-Queries würde erst hier auffallen, nicht im trackClick-Test.
  it("blendet Bot-Klicks aus allen getStats-Metriken aus", async () => {
    const botAgent = "Googlebot/2.1 (+http://www.google.com/bot.html)";
    const humanAgent = "Mozilla/5.0 (Windows NT 10.0)";

    await trackClick({
      linkId: testCode,
      referrer: "https://google.com",
      userAgent: botAgent,
      ip: "66.249.64.1",
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://google.com",
      userAgent: botAgent,
      ip: "66.249.64.2",
    });
    await trackClick({
      linkId: testCode,
      referrer: "https://twitter.com",
      userAgent: humanAgent,
      ip: "1.2.3.4",
    });

    const result = await getStats(testCode);

    assert.equal(result.success, true);
    // Nur der eine menschliche Klick darf zählen
    assert.equal(result.data.totalClicks, 1);
    assert.equal(result.data.uniqueVisitors, 1);
    // Bot-Referrer darf nicht in topReferrers auftauchen
    const referrers = result.data.topReferrers.map((r) => r.referrer);
    assert.ok(!referrers.includes("https://google.com"));
    assert.ok(referrers.includes("https://twitter.com"));
    // clicksByDay darf nur den einen Human-Klick enthalten, nicht die Bot-Klicks.
    // Dieser Query hat ein eigenes WHERE in queryStats – ohne expliziten Test
    // würde ein fehlendes is_bot=FALSE dort unbemerkt bleiben.
    assert.equal(result.data.clicksByDay[0].count, 1);
  });

  // FEHLERFALL: getStats für unbekannten Code gibt NOT_FOUND zurück.
  // Wir prüfen den error-String explizit – konsistentes Verhalten über
  // alle Service-Funktionen soll sichtbar sein.
  it("gibt err('NOT_FOUND') zurück für unbekannten code", async () => {
    const result = await getStats("xxxxxx");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "NOT_FOUND");
  });
});
