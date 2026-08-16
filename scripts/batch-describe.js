/**
 * @fileoverview Batch-Script: Erzeugt deutsche Kurzbeschreibungen für short_links ohne description.
 * @description Lädt alle Links mit description IS NULL, ruft ein kostenloses OpenRouter-Modell
 *   pro URL auf, speichert die Beschreibung in der DB und gibt die Token-Nutzung aus.
 */

import pg from "pg";
import { config } from "../src/config.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemma-4-26b-a4b-it:free";
const RATE_LIMIT_MS = 100;

const SYSTEM_PROMPT =
  "Generiere eine Kurzbeschreibung (1 Satz, max 15 Wörter) für die gegebene URL. Antworte nur mit dem Satz, ohne Anführungszeichen.";

const poolConfig = config.database.url
  ? {
      connectionString: config.database.url,
      ssl: config.isProduction ? { rejectUnauthorized: true } : false,
    }
  : {
      host: config.database.host,
      port: config.database.port || undefined,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password || undefined,
    };

const pool = new pg.Pool(poolConfig);

if (!config.openrouter.apiKey) {
  console.error(
    "OPENROUTER_API_KEY fehlt. Batch-Beschreibung kann nicht gestartet werden.",
  );
  process.exit(1);
}

/**
 * Lädt alle short_links ohne Beschreibung.
 * @returns {Promise<Array<{code: string, original_url: string}>>}
 */
const loadUndescribedLinks = async () => {
  const { rows } = await pool.query(
    "SELECT code, original_url, created_at FROM short_links WHERE description IS NULL ORDER BY created_at",
  );
  return rows;
};

/**
 * Speichert die Beschreibung für einen Link.
 * @param {string} code
 * @param {string} description
 * @returns {Promise<void>}
 */
const saveDescription = async (code, description) => {
  await pool.query("UPDATE short_links SET description = $1 WHERE code = $2", [
    description,
    code,
  ]);
};

/**
 * Ruft OpenRouter für eine URL auf und gibt Beschreibung + Token-Nutzung zurück.
 * @param {string} url
 * @returns {Promise<{description: string, usage: {prompt_tokens: number, completion_tokens: number}}>}
 */
const generateDescription = async (url) => {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openrouter.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://link-shortener.dev2ksoftware.com",
      "X-Title": "LinkShort",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 100,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: url },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter API Fehler ${response.status}: ${await response.text()}`,
    );
  }

  const data = await response.json();
  return {
    description: data.choices?.[0]?.message?.content?.trim() ?? "",
    usage: data.usage ?? { prompt_tokens: 0, completion_tokens: 0 },
  };
};

/**
 * Pausiert für die angegebene Zeit.
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Hauptfunktion: Lädt Links, erzeugt Beschreibungen, speichert sie.
 */
const processBatch = async () => {
  const links = await loadUndescribedLinks();
  console.log(`\nLinks ohne Beschreibung: ${links.length}`);

  if (links.length === 0) {
    console.log("Nichts zu tun.");
    return;
  }

  console.log(`Modell: ${MODEL} (kostenlos)\n`);

  let processed = 0;
  let failed = 0;
  let totalInput = 0;
  let totalOutput = 0;

  for (const link of links) {
    try {
      const { description, usage } = await generateDescription(
        link.original_url,
      );
      await saveDescription(link.code, description);
      totalInput += usage.prompt_tokens ?? 0;
      totalOutput += usage.completion_tokens ?? 0;
      processed++;
      console.log(`✓ ${link.original_url}\n  → ${description}`);
    } catch (error) {
      failed++;
      console.error(`✗ ${link.original_url}\n  → ${error.message}`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  console.log(`
── Zusammenfassung ──────────────────────
  Verarbeitet : ${processed}
  Fehler      : ${failed}
  Input-Tokens: ${totalInput}
  Output-Tokens: ${totalOutput}
─────────────────────────────────────────`);
};

processBatch()
  .catch((error) => console.error("Batch fehlgeschlagen:", error))
  .finally(() => pool.end());
