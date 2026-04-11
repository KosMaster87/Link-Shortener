/**
 * @fileoverview Route-Handler für Nutzer-Feedback
 * @description POST /api/feedback – speichert Feedback in der DB.
 *   Keine Auth erforderlich, damit auch nicht-eingeloggte Nutzer Feedback geben können.
 * @module src/routes/feedback
 */
import { pool } from "../db/index.js";
import { sendFeedbackNotification } from "../services/email-service.js";

const ALLOWED_TYPES = new Set(["bug", "improvement", "other"]);
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_EMAIL_LENGTH = 254;

/**
 * Serialisiert data als JSON und sendet die Response mit dem gegebenen Status.
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {*} data
 * @returns {void}
 */
const send = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

/**
 * Validiert und speichert eingehendes Nutzer-Feedback.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
export const handleFeedback = async (req, res) => {
  const { type, description, email } = req.body ?? {};

  if (!ALLOWED_TYPES.has(type)) {
    return send(res, 422, {
      error: "INVALID_INPUT",
      message: "type muss 'bug', 'improvement' oder 'other' sein.",
    });
  }

  if (typeof description !== "string" || description.trim().length === 0) {
    return send(res, 422, {
      error: "INVALID_INPUT",
      message: "description darf nicht leer sein.",
    });
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return send(res, 422, {
      error: "INVALID_INPUT",
      message: `description darf maximal ${MAX_DESCRIPTION_LENGTH} Zeichen haben.`,
    });
  }

  if (email !== undefined && email !== null && email !== "") {
    if (
      typeof email !== "string" ||
      email.length > MAX_EMAIL_LENGTH ||
      !email.includes("@")
    ) {
      return send(res, 422, {
        error: "INVALID_INPUT",
        message: "Ungültige E-Mail-Adresse.",
      });
    }
  }

  try {
    await pool.query(
      "INSERT INTO feedback (type, description, email) VALUES ($1, $2, $3)",
      [type, description.trim(), email?.trim() || null],
    );
    sendFeedbackNotification({
      type,
      description: description.trim(),
      email: email?.trim() || undefined,
    }).catch((err) =>
      console.error("[email-service] Fehler beim Senden:", err.message),
    );
    return send(res, 201, { message: "Danke für dein Feedback!" });
  } catch (err) {
    if (err.code === "42P01") {
      // Tabelle existiert noch nicht – Migration noch nicht ausgeführt
      return send(res, 503, {
        error: "SERVICE_UNAVAILABLE",
        message: "Feedback ist gerade nicht verfügbar.",
      });
    }
    return send(res, 500, { error: "INTERNAL_ERROR" });
  }
};
