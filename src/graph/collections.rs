pub type HashMap<K, V> = bun_collections::hashbrown::HashMap<K, V, bun_wyhash::BuildHasher>;
pub type HashSet<K> = bun_collections::hashbrown::HashSet<K, bun_wyhash::BuildHasher>;
