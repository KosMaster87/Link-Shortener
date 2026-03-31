CREATE TABLE short_links (
  code         TEXT PRIMARY KEY,
  original_url TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE link_clicks (
  id         SERIAL PRIMARY KEY,
  code       TEXT REFERENCES short_links(code) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  referrer   TEXT,
  user_agent TEXT,
  ip_hash    TEXT,
  is_bot     BOOLEAN NOT NULL DEFAULT FALSE
);
