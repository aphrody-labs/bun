export const buckets = ["aphrody", "dragonballfr"] as const;
export type BucketName = (typeof buckets)[number];

export const isBucket = (name: string): name is BucketName => (buckets as readonly string[]).includes(name);

export function bucketFor(env: Env, name: BucketName): R2Bucket {
  return name === "aphrody" ? env.APHRODY : env.DRAGONBALLFR;
}
