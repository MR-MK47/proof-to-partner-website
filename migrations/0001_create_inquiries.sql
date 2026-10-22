CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('buyer', 'supplier', 'general')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  company TEXT NOT NULL DEFAULT '' CHECK (length(company) <= 160),
  website TEXT NOT NULL DEFAULT '' CHECK (length(website) <= 300),
  location TEXT NOT NULL DEFAULT '' CHECK (length(location) <= 160),
  category TEXT NOT NULL DEFAULT '' CHECK (length(category) <= 160),
  timing TEXT NOT NULL DEFAULT '' CHECK (length(timing) <= 100),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 10 AND 5000),
  consent_at TEXT NOT NULL,
  privacy_policy_version TEXT NOT NULL,
  ip_hash TEXT,
  notification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (notification_status IN ('pending', 'sent', 'failed', 'not_configured')),
  acknowledgement_status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (acknowledgement_status IN ('not_requested', 'sent', 'failed', 'not_configured')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_inquiries_ip_hash_created_at ON inquiries(ip_hash, created_at);