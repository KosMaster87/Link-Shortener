/**
 * @fileoverview Email-Benachrichtigungen via Resend API
 * @description Sendet eine Notification-Email wenn neues Feedback eingeht.
 *   Nutzt fetch() gegen die Resend REST API (kein SMTP, kein npm-Paket).
 *   Konfiguration über Env-Variablen: RESEND_API_KEY, FROM_EMAIL, TO_EMAIL.
 *   Wenn RESEND_API_KEY nicht gesetzt ist, wird das Senden übersprungen.
 * @module src/services/email-service
 */

const RESEND_API_URL = "https://api.resend.com/emails";

const TYPE_LABELS = {
  bug: "Bug",
  improvement: "Verbesserungsvorschlag",
  other: "Sonstiges",
};

/**
 * Sendet eine Feedback-Notification-Email via Resend.
 * Gibt stillschweigend auf wenn RESEND_API_KEY nicht gesetzt ist (dev/CI).
 * @param {{ type: string, description: string, email?: string }} feedback
 * @param {function} [_fetch] Optionaler fetch-Override (für Tests)
 * @returns {Promise<void>}
 */
export const sendFeedbackNotification = async (
  { type, description, email },
  _fetch = undefined,
) => {
  if (!process.env.RESEND_API_KEY) return;

  const toEmail = process.env.TO_EMAIL;
  const fromEmail = process.env.FROM_EMAIL;

  if (!toEmail || !fromEmail) return;

  const typeLabel = TYPE_LABELS[type] ?? type;
  const replyLine = email ? `\nAntwort an: ${email}` : "";

  const fetchFn = _fetch ?? fetch;

  const res = await fetchFn(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `LinkShort Feedback <${fromEmail}>`,
      to: [toEmail],
      subject: `[LinkShort Feedback] ${typeLabel}`,
      text: `Neues Feedback eingegangen:\n\nTyp: ${typeLabel}\n${replyLine}\n\nBeschreibung:\n${description}`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API Fehler ${res.status}: ${body}`);
  }
};
