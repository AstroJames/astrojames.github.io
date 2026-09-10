CREATE TABLE website_visit_total (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  visits INTEGER NOT NULL DEFAULT 0 CHECK(visits >= 0),
  started_on TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE website_visit_daily (
  day TEXT PRIMARY KEY NOT NULL,
  visits INTEGER NOT NULL CHECK(visits >= 0)
);
--> statement-breakpoint
CREATE TABLE website_visit_sessions (
  session_hash TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_website_visit_expiry ON website_visit_sessions(expires_at);
