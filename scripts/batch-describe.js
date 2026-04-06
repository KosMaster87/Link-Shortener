/**
 * @fileoverview Batch-Script: Erzeugt deutsche Kurzbeschreibungen für short_links ohne description.
 * @description Lädt alle Links mit description IS NULL, ruft Haiku pro URL auf,
 *   speichert die Beschreibung in der DB und gibt Token-Kosten aus.
 */

import pg from "pg";
import Anthropic from "@anthropic-ai/sdk";

const INPUT_COST_PER_M = 1.0;
const OUTPUT_COST_PER_M = 5.0;
const RATE_LIMIT_MS = 100;

const SYSTEM_PROMPT =
  "Generiere eine Kurzbeschreibung (1 Satz, max 15 Wörter) für die gegebene URL. Antworte nur mit dem Satz, ohne Anführungszeichen.";

const pool = new pg.Pool({
  host: process.env.PGHOST ?? "/var/run/postgresql",
  port: process.env.PGPORT,
  database: process.env.PGDATABASE ?? "linkshort",
  user: process.env.PGUSER ?? "dev2k",
  password: process.env.PGPASSWORD,
});
const anthropic = new Anthropic();

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
 * Ruft Haiku für eine URL auf und gibt Beschreibung + usage zurück.
 * @param {string} url
 * @returns {Promise<{description: string, usage: {input_tokens: number, output_tokens: number}}>}
 */
const generateDescription = async (url) => {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: url }],
  });
  return {
    description: response.content[0].text.trim(),
    usage: response.usage,
  };
};

/**
 * Berechnet geschätzte Kosten in USD.
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {number}
 */
const calcCost = (inputTokens, outputTokens) =>
  (inputTokens / 1_000_000) * INPUT_COST_PER_M +
  (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;

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

  // Vorab-Schätzung: ~20 Input-Tokens pro URL, ~25 Output-Tokens
  const estimatedInput = links.length * 20;
  const estimatedOutput = links.length * 25;
  const estimatedCost = calcCost(estimatedInput, estimatedOutput);
  console.log(`Geschätzte Kosten: $${estimatedCost.toFixed(6)}\n`);

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
      totalInput += usage.input_tokens;
      totalOutput += usage.output_tokens;
      processed++;
      console.log(`✓ ${link.original_url}\n  → ${description}`);
    } catch (error) {
      failed++;
      console.error(`✗ ${link.original_url}\n  → ${error.message}`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  const totalCost = calcCost(totalInput, totalOutput);
  console.log(`
── Zusammenfassung ──────────────────────
  Verarbeitet : ${processed}
  Fehler      : ${failed}
  Input-Tokens: ${totalInput}
  Output-Tokens: ${totalOutput}
  Gesamtkosten: $${totalCost.toFixed(6)}
─────────────────────────────────────────`);
};

processBatch()
  .catch((error) => console.error("Batch fehlgeschlagen:", error))
  .finally(() => pool.end());
