/**
 * @fileoverview Tests für classifyDevice und getDeviceStats
 * @description Unit-Tests für die Geräte-Klassifizierung und Integrationstests
 *   für die Aggregation gegen die echte Datenbank.
 * @module tests/analytics-devices.test
 */
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { pool } from "../src/db/index.js";
import {
  getDeviceStats,
  trackClick,
} from "../src/services/analytics-service.js";
import { classifyDevice } from "../src/utils/device-classifier.js";
import { createLink } from "../src/services/link-service.js";

let testCode;

beforeEach(async () => {
  const result = await createLink({ url: "https://example.com/devices-test" });
  testCode = result.data.code;
});

afterEach(async () => {
  await pool.query("DELETE FROM link_clicks WHERE code = $1", [testCode]);
  await pool.query("DELETE FROM short_links WHERE code = $1", [testCode]);
});

after(async () => {
  await pool.end();
});

// ─── classifyDevice – Unit-Tests ──────────────────────────────────────────────

describe("classifyDevice – Desktop", () => {
  // DESKTOP-FALLBACK: Ein normaler Chrome-UA enthält kein bekanntes Mobile/Tablet-Pattern.
  it("Chrome-Desktop-UA → desktop", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";
    assert.equal(classifyDevice(ua), "desktop");
  });

  it("Firefox-Desktop-UA → desktop", () => {
    const ua =
      "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0";
    assert.equal(classifyDevice(ua), "desktop");
  });
});

describe("classifyDevice – Mobile", () => {
  // IPHONE: Enthält "iphone" — eindeutiges Mobile-Pattern.
  it("iPhone-UA → mobile", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    assert.equal(classifyDevice(ua), "mobile");
  });

  // ANDROID-PHONE: Enthält "android" und "mobile" — beide treffen Mobile-Pattern.
  // Enthält KEIN "tablet" → darf nicht als Tablet klassifiziert werden.
  it("Android-Phone-UA → mobile", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";
    assert.equal(classifyDevice(ua), "mobile");
  });

  it("Windows Phone → mobile", () => {
    const ua =
      "Mozilla/5.0 (compatible; MSIE 10.0; Windows Phone 8.0; Trident/6.0)";
    assert.equal(classifyDevice(ua), "mobile");
  });
});

describe("classifyDevice – Tablet", () => {
  // IPAD: Enthält "ipad" — eindeutiges Tablet-Pattern, kein Mobile-Konflikt.
  it("iPad-UA → tablet", () => {
    const ua =
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    assert.equal(classifyDevice(ua), "tablet");
  });

  // TABLET-PRIORITÄT: Android-Tablet-UA enthält SOWOHL "android" (Mobile) ALS AUCH "tablet".
  // Ohne die TABLET-vor-MOBILE-Reihenfolge würde dieser Test fehlschlagen.
  // Das ist der kritischste Test für die Klassifizierungslogik.
  it("Android-Tablet-UA → tablet (Tablet-Priorität vor Mobile)", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 13; SM-X200 Tablet) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
    assert.equal(classifyDevice(ua), "tablet");
  });

  it("Kindle-UA → tablet", () => {
    const ua = "Mozilla/5.0 (Linux; U; en-us; KFAPWI Build/JDQ39) Silk/3.68";
    assert.equal(classifyDevice(ua), "tablet");
  });
});

describe("classifyDevice – Crash-Schutz", () => {
  // NULL/UNDEFINED/LEER: Diese Werte kommen vor wenn User-Agent nicht gesendet wurde
  // (curl, programmatische Clients). toLowerCase() würde auf null crashen.
  it("null → desktop (kein Crash)", () => {
    assert.equal(classifyDevice(null), "desktop");
  });

  it("undefined → desktop (kein Crash)", () => {
    assert.equal(classifyDevice(undefined), "desktop");
  });

  it("leerer String → desktop (kein Crash)", () => {
    assert.equal(classifyDevice(""), "desktop");
  });
});

// ─── getDeviceStats – Integrationstests ──────────────────────────────────────

describe("getDeviceStats – leeres Ergebnis", () => {
  // Null-Zähler für alle Typen wenn kein Klick vorhanden.
  // Warum: Das Frontend rendert Balkendiagramme — null statt 0 würde die UI brechen.
  it("gibt { mobile: 0, tablet: 0, desktop: 0 } zurück wenn keine Klicks", async () => {
    const result = await getDeviceStats(testCode);

    assert.equal(result.success, true);
    assert.deepEqual(result.data, { mobile: 0, tablet: 0, desktop: 0 });
  });
});

describe("getDeviceStats – Gerätezählung", () => {
  // DESKTOP: Chrome-Desktop-UA soll korrekt in desktop-Zähler einfließen.
  it("zählt Desktop-Klick korrekt", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      ip: "1.1.1.1",
    });

    const result = await getDeviceStats(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data.desktop, 1);
    assert.equal(result.data.mobile, 0);
    assert.equal(result.data.tablet, 0);
  });

  // MOBILE: iPhone-UA soll in mobile-Zähler fließen.
  it("zählt Mobile-Klick korrekt", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148",
      ip: "2.2.2.2",
    });

    const result = await getDeviceStats(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data.mobile, 1);
    assert.equal(result.data.desktop, 0);
    assert.equal(result.data.tablet, 0);
  });

  // TABLET-PRIORITÄT: Android-Tablet-UA enthält "android" (Mobile-Pattern) UND "tablet".
  // Korrekte Klassifizierung als tablet stellt sicher, dass getDeviceStats
  // denselben TABLET-vor-MOBILE-Vorrang wie classifyDevice enforced.
  it("zählt Android-Tablet-Klick als tablet, nicht als mobile", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; SM-X200 Tablet) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      ip: "3.3.3.3",
    });

    const result = await getDeviceStats(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data.tablet, 1);
    assert.equal(result.data.mobile, 0);
    assert.equal(result.data.desktop, 0);
  });

  // GEMISCHTE GERÄTE: Alle drei Typen in einem Test — stellt sicher dass
  // aggregateDevices() alle Zähler korrekt inkrementiert, nicht überschreibt.
  it("zählt mobile, tablet und desktop getrennt", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      ip: "1.1.1.1",
    });
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148",
      ip: "2.2.2.2",
    });
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; SM-X200 Tablet) AppleWebKit/537.36 Safari/537.36",
      ip: "3.3.3.3",
    });

    const result = await getDeviceStats(testCode);

    assert.equal(result.success, true);
    assert.equal(result.data.desktop, 1);
    assert.equal(result.data.mobile, 1);
    assert.equal(result.data.tablet, 1);
  });
});

describe("getDeviceStats – Bot-Filter und Null-UA", () => {
  // BOTS AUSBLENDEN: Bot-Klicks haben is_bot=TRUE — queryUserAgents filtert sie
  // per is_bot=FALSE heraus. Bots verfälschen sonst die Geräte-Verteilung.
  it("Bot-Klicks fließen nicht in die Geräte-Zählung ein", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)",
      ip: "66.249.64.1",
    });
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      ip: "1.2.3.4",
    });

    const result = await getDeviceStats(testCode);

    assert.equal(result.success, true);
    // Nur der Human-Klick zählt — Googlebot-UA bleibt unsichtbar
    assert.equal(result.data.desktop, 1);
    assert.equal(result.data.mobile, 0);
  });

  // NULL-USER-AGENT: Klicks ohne UA (curl, programmatische Clients) werden via
  // `user_agent IS NOT NULL` in queryUserAgents herausgefiltert.
  // aggregateDevices sieht diese Zeilen nie — kein Crash durch classifyDevice(null).
  it("Klicks ohne user_agent werden übersprungen, kein Crash", async () => {
    await trackClick({
      linkId: testCode,
      referrer: null,
      userAgent: null,
      ip: "1.2.3.4",
    });

    const result = await getDeviceStats(testCode);

    assert.equal(result.success, true);
    assert.deepEqual(result.data, { mobile: 0, tablet: 0, desktop: 0 });
  });
});

describe("getDeviceStats – Fehlerfälle", () => {
  // NOT_FOUND: Konsistentes Verhalten wie getStats, getReferrers, getClicksByPeriod.
  it("gibt err('NOT_FOUND') für unbekannten Code", async () => {
    const result = await getDeviceStats("xxxxxx");

    assert.equal(result.success, false);
    assert.equal(result.error.code, "NOT_FOUND");
  });
});
