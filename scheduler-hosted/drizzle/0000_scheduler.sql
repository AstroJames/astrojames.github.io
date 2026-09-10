CREATE TABLE people (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE availability (
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK(day BETWEEN 0 AND 4),
  hour INTEGER NOT NULL CHECK(hour BETWEEN 9 AND 16),
  PRIMARY KEY(person_id, day, hour)
);
--> statement-breakpoint
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_sessions_person ON sessions(person_id);
--> statement-breakpoint
CREATE INDEX idx_sessions_expiry ON sessions(expires);
--> statement-breakpoint
CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
