/**
 * @fileoverview Email-Benachrichtigungen via Gmail SMTP (Nodemailer)
 * @description Sendet eine Notification-Email wenn neues Feedback eingeht.
 *   Konfiguration über Env-Variablen: SMTP_HOST, SMTP_PORT, SMTP_USER,
 *   SMTP_PASS, FROM_EMAIL, TO_EMAIL.
 *   Wenn SMTP_PASS nicht gesetzt ist, wird das Senden übersprungen (kein Crash).
 * @module src/services/email-service
 */
import nodemailer from "nodemailer";

const TYPE_LABELS = {
  bug: "Bug",
  improvement: "Verbesserungsvorschlag",
  other: "Sonstiges",
};

/**
 * Erstellt einen konfigurierten Nodemailer-Transporter.
 * @returns {import("nodemailer").Transporter}
 */
const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

/**
 * Sendet eine Feedback-Notification-Email.
 * Gibt stillschweigend auf wenn SMTP_PASS nicht gesetzt ist (dev/CI).
 * @param {{ type: string, description: string, email?: string }} feedback
 * @param {object} [_transporter] Optionaler Transporter-Override (für Tests)
 * @returns {Promise<void>}
 */
export const sendFeedbackNotification = async (
  { type, description, email },
  _transporter = undefined,
) => {
  if (!process.env.SMTP_PASS) return;

  const toEmail = process.env.TO_EMAIL;
  const fromEmail = process.env.FROM_EMAIL ?? process.env.SMTP_USER;

  if (!toEmail || !fromEmail) return;

  const typeLabel = TYPE_LABELS[type] ?? type;
  const replyLine = email ? `\nAntwort an: ${email}` : "";

  const transporter = _transporter ?? createTransporter();

  await transporter.sendMail({
    from: `"LinkShort Feedback" <${fromEmail}>`,
    to: toEmail,
    subject: `[LinkShort Feedback] ${typeLabel}`,
    text: `Neues Feedback eingegangen:\n\nTyp: ${typeLabel}\n${replyLine}\n\nBeschreibung:\n${description}`,
  });
};
