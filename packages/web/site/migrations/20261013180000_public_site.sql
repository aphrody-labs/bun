CREATE SCHEMA aphrody_site;
REVOKE ALL ON SCHEMA aphrody_site FROM PUBLIC;

CREATE TABLE aphrody_site.snapshots (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  profile text NOT NULL CHECK (profile = 'bun'),
  repository text NOT NULL CHECK (repository = 'aphrody-labs/bun'),
  source_sha text NOT NULL CHECK (source_sha ~ '^[a-f0-9]{40}$'),
  source_date timestamptz NOT NULL,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  counts jsonb NOT NULL CHECK (jsonb_typeof(counts) = 'object'),
  UNIQUE (profile, id)
);
CREATE TABLE aphrody_site.current_snapshots (
  profile text PRIMARY KEY CHECK (profile = 'bun'),
  snapshot_id text NOT NULL,
  FOREIGN KEY (profile, snapshot_id) REFERENCES aphrody_site.snapshots (profile, id)
);
CREATE TABLE aphrody_site.documents (
  snapshot_id text NOT NULL REFERENCES aphrody_site.snapshots (id) ON DELETE CASCADE,
  path text NOT NULL CHECK (path ~ '^docs/[A-Za-z0-9_./-]+\.mdx?$'),
  title text NOT NULL,
  description text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (snapshot_id, path)
);
CREATE TABLE aphrody_site.doc_chunks (
  snapshot_id text NOT NULL,
  path text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  body text NOT NULL CHECK (octet_length(body) <= 16384),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  search tsvector GENERATED ALWAYS AS (to_tsvector('simple', body)) STORED,
  PRIMARY KEY (snapshot_id, path, ordinal),
  FOREIGN KEY (snapshot_id, path) REFERENCES aphrody_site.documents (snapshot_id, path) ON DELETE CASCADE
);
CREATE INDEX doc_chunks_search ON aphrody_site.doc_chunks USING gin (search);
CREATE TABLE aphrody_site.graph_domains (
  snapshot_id text NOT NULL REFERENCES aphrody_site.snapshots (id) ON DELETE CASCADE,
  name text NOT NULL,
  files integer NOT NULL CHECK (files >= 0),
  PRIMARY KEY (snapshot_id, name)
);
CREATE TABLE aphrody_site.graph_links (
  snapshot_id text NOT NULL,
  source text NOT NULL,
  target text NOT NULL,
  references_count integer NOT NULL CHECK (references_count > 0),
  PRIMARY KEY (snapshot_id, source, target),
  FOREIGN KEY (snapshot_id, source) REFERENCES aphrody_site.graph_domains (snapshot_id, name) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id, target) REFERENCES aphrody_site.graph_domains (snapshot_id, name) ON DELETE CASCADE
);
CREATE INDEX graph_links_target ON aphrody_site.graph_links (snapshot_id, target);
CREATE TABLE aphrody_site.release_facts (
  snapshot_id text NOT NULL REFERENCES aphrody_site.snapshots (id) ON DELETE CASCADE,
  tag text NOT NULL,
  facts jsonb NOT NULL CHECK (jsonb_typeof(facts) = 'object'),
  PRIMARY KEY (snapshot_id, tag)
);
REVOKE ALL ON ALL TABLES IN SCHEMA aphrody_site FROM PUBLIC;
