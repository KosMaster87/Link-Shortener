/**
 * @fileoverview CLI-Script: Generiert eine deutsche Kurzbeschreibung für eine URL via Claude API.
 * Usage: node --env-file-if-exists=.env bin/describe-url.js <url>
 */

import Anthropic from "@anthropic-ai/sdk";

const INPUT_COST_PER_TOKEN = 1 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 5 / 1_000_000;

const url = process.argv[2];

if (!url) {
  console.error("Fehler: Keine URL angegeben.");
  console.error("Usage: node bin/describe-url.js <url>");
  process.exit(1);
}

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 100,
  system:
    "URL-Beschreibungs-Generator für LinkShort. Antworte mit genau einem Satz auf Deutsch. Kein Punkt am Ende.",
  messages: [{ role: "user", content: url }],
});

const text = response.content.find((b) => b.type === "text")?.text ?? "";
console.log(text);

const { input_tokens, output_tokens } = response.usage;
const cost =
  input_tokens * INPUT_COST_PER_TOKEN + output_tokens * OUTPUT_COST_PER_TOKEN;

console.error(
  `[tokens] input=${input_tokens} output=${output_tokens} cost=$${cost.toFixed(6)}`,
);
