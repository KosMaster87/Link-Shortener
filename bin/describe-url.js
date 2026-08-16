/**
 * @fileoverview CLI-Script: Generiert eine deutsche Kurzbeschreibung für eine URL via OpenRouter.
 * Usage: node --env-file-if-exists=.env bin/describe-url.js <url>
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemma-4-26b-a4b-it:free";

const url = process.argv[2];

if (!url) {
  console.error("Fehler: Keine URL angegeben.");
  console.error("Usage: node bin/describe-url.js <url>");
  process.exit(1);
}

const apiKey = process.env.OPENROUTER_API_KEY?.trim();

if (!apiKey) {
  console.error("Fehler: OPENROUTER_API_KEY ist nicht gesetzt.");
  process.exit(1);
}

const response = await fetch(OPENROUTER_URL, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://link-shortener.dev2ksoftware.com",
    "X-Title": "LinkShort",
  },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 100,
    messages: [
      {
        role: "system",
        content:
          "URL-Beschreibungs-Generator für LinkShort. Antworte mit genau einem Satz auf Deutsch. Kein Punkt am Ende.",
      },
      { role: "user", content: url },
    ],
  }),
});

if (!response.ok) {
  console.error(
    `OpenRouter API Fehler ${response.status}: ${await response.text()}`,
  );
  process.exit(1);
}

const data = await response.json();
const text = data.choices?.[0]?.message?.content?.trim() ?? "";
console.log(text);

const { prompt_tokens, completion_tokens } = data.usage ?? {};
console.error(
  `[tokens] input=${prompt_tokens ?? "?"} output=${completion_tokens ?? "?"} model=${MODEL} (kostenlos)`,
);
