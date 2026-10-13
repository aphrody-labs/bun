CREATE TABLE aphrody_site.native_graph_sources (
  snapshot_id text NOT NULL REFERENCES aphrody_site.snapshots(id) ON DELETE CASCADE,
  domain text NOT NULL,
  graph_sha256 text NOT NULL CHECK (graph_sha256 ~ '^[a-f0-9]{64}$'),
  revision text NOT NULL CHECK (revision ~ '^[a-f0-9]{40}$'),
  producer_sha256 text NOT NULL CHECK (producer_sha256 ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (snapshot_id, domain)
);
CREATE TABLE aphrody_site.native_graph_nodes (
  snapshot_id text NOT NULL,
  id text NOT NULL CHECK (id ~ '^[a-f0-9]{64}$'),
  domain text NOT NULL,
  kind text NOT NULL,
  label text NOT NULL CHECK (octet_length(label)<=16384),
  path text NOT NULL,
  line integer CHECK (line>0),
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[a-f0-9]{64}$'),
  provenance text NOT NULL CHECK (provenance='EXTRACTED'),
  search tsvector GENERATED ALWAYS AS (to_tsvector('simple', regexp_replace(label,'([a-z])([A-Z])','\1 \2','g') || ' ' || regexp_replace(path,'[/_.-]',' ','g'))) STORED,
  PRIMARY KEY (snapshot_id,id),
  FOREIGN KEY (snapshot_id,domain) REFERENCES aphrody_site.native_graph_sources(snapshot_id,domain) ON DELETE CASCADE
);
CREATE INDEX native_graph_nodes_search ON aphrody_site.native_graph_nodes USING gin(search);
CREATE INDEX native_graph_nodes_domain ON aphrody_site.native_graph_nodes(snapshot_id,domain);
CREATE TABLE aphrody_site.native_graph_edges (
  snapshot_id text NOT NULL,
  source text NOT NULL,
  target text NOT NULL,
  kind text NOT NULL,
  provenance text NOT NULL,
  confidence real NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  PRIMARY KEY (snapshot_id,source,target,kind,provenance),
  FOREIGN KEY (snapshot_id,source) REFERENCES aphrody_site.native_graph_nodes(snapshot_id,id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id,target) REFERENCES aphrody_site.native_graph_nodes(snapshot_id,id) ON DELETE CASCADE
);
CREATE INDEX native_graph_edges_target ON aphrody_site.native_graph_edges(snapshot_id,target);
REVOKE ALL ON ALL TABLES IN SCHEMA aphrody_site FROM PUBLIC;
