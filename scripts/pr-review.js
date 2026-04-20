/**
 * @fileoverview Erstellt ein automatisches PR-Review aus einem Git-Diff via Claude API.
 * @description Liest pr_diff.txt, begrenzt die Diff-Größe und schreibt das Ergebnis nach review_output.md.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || "";

const INPUT_DIFF_FILE = "pr_diff.txt";
const OUTPUT_REVIEW_FILE = "review_output.md";
const MAX_DIFF_CHARS = 50_000;
const MODEL = "claude-sonnet-4-5";
const MARKER = "<!-- pr-review-bot -->";

const SYSTEM_PROMPT = `Du bist Code-Reviewer für LinkShort (node:http, pg, Plain JavaScript).

Prioritaet:
1) Bugs und Verhaltensregressionen
2) Security-Risiken
3) Performance-Risiken
4) Fehlende Tests
5) Lesbarkeit/Struktur

Ausgabeformat (Markdown):
### Summary
2-3 Sätze.

### Findings
- Nur echte Findings aufnehmen (max. 5), priorisiert.
- Pro Finding: Schweregrad (High/Medium/Low), betroffene Datei/Funktion, kurze Begründung.
- Wenn keine Findings vorhanden sind, exakt schreiben: "Keine kritischen Findings."

### Test-Gaps
- Nenne fehlende oder sinnvolle Tests knapp.

Sei präzise und konstruktiv. Keine erfundenen Fakten.`;

/**
 * Liest den PR-Diff aus Datei.
 * @returns {string}
 */
function loadDiff() {
  try {
    return readFileSync(INPUT_DIFF_FILE, "utf8");
  } catch {
    console.error(`${INPUT_DIFF_FILE} not found`);
    process.exit(1);
  }
}

/**
 * Schreibt den finalen Review-Text in die Output-Datei.
 * @param {string} review
 */
function writeReview(review) {
  const withMarker = review.includes(MARKER) ? review : `${MARKER}\n${review}`;
  writeFileSync(OUTPUT_REVIEW_FILE, withMarker, "utf8");
}

/**
 * Trimmt den Diff auf eine sichere Größe.
 * @param {string} diff
 * @returns {{diff: string, wasTrimmed: boolean}}
 */
function trimDiff(diff) {
  if (diff.length <= MAX_DIFF_CHARS) {
    return { diff, wasTrimmed: false };
  }
  return {
    diff: `${diff.slice(0, MAX_DIFF_CHARS)}\n\n[... Diff gekürzt ...]`,
    wasTrimmed: true,
  };
}

const rawDiff = loadDiff();

if (!rawDiff.trim()) {
  writeReview("Keine Änderungen zum Reviewen gefunden.");
  process.exit(0);
}

if (!ANTHROPIC_API_KEY) {
  writeReview("Review übersprungen: ANTHROPIC_API_KEY ist nicht gesetzt.");
  process.exit(0);
}

const { diff, wasTrimmed } = trimDiff(rawDiff);
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

try {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Bitte reviewe diesen Pull-Request-Diff:\n\n\`\`\`diff\n${diff}\n\`\`\``,
      },
    ],
  });

  const text =
    message.content?.[0]?.type === "text"
      ? message.content[0].text
      : "Kein Review-Text erzeugt.";
  const trimNotice = wasTrimmed
    ? "\n\n_Hinweis: Der Diff wurde für das Review auf 50.000 Zeichen gekürzt._"
    : "";

  console.log(
    `Tokens: ${message.usage.input_tokens} in, ${message.usage.output_tokens} out`,
  );
  writeReview(`${text}${trimNotice}`);
} catch (error) {
  console.error("Claude Review fehlgeschlagen:", error.message);
  writeReview(`Review fehlgeschlagen: ${error.message}`);
  process.exit(1);
}
