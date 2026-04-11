-- Migration 004: feedback-Tabelle
-- Ausführen: psql -d linkshort -f src/db/migrations/004_add_feedback.sql

CREATE TABLE IF NOT EXISTS feedback (
  id          SERIAL PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('bug', 'improvement', 'other')),
  description TEXT NOT NULL,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
