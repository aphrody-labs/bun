CREATE TABLE IF NOT EXISTS files (
  bucket TEXT NOT NULL,
  key TEXT NOT NULL,
  size INTEGER NOT NULL,
  etag TEXT NOT NULL,
  content_type TEXT,
  uploaded_at INTEGER NOT NULL,
  PRIMARY KEY (bucket, key)
);

CREATE INDEX IF NOT EXISTS files_uploaded_at ON files (uploaded_at);
