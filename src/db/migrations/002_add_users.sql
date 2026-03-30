-- Migration 002: users-Tabelle (UUID) + user_id in short_links
-- Ausführen: psql -d linkshort -f src/db/migrations/002_add_users.sql
-- gen_random_uuid() ist in PostgreSQL 13+ built-in (kein pgcrypto nötig)

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE short_links
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
