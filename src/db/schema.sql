CREATE TABLE short_links (
  code         TEXT PRIMARY KEY,
  original_url TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Migration Tag 4: is_active hinzufügen
-- ALTER TABLE short_links ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE link_clicks (
  id         SERIAL PRIMARY KEY,
  code       TEXT REFERENCES short_links(code) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  referrer   TEXT,
  user_agent TEXT,
  ip_hash    TEXT,
  is_bot     BOOLEAN NOT NULL DEFAULT FALSE
);

-- Migration Analytics: ip_hash und is_bot hinzufügen
-- ALTER TABLE link_clicks ADD COLUMN ip_hash TEXT;
-- ALTER TABLE link_clicks ADD COLUMN is_bot BOOLEAN NOT NULL DEFAULT FALSE;
