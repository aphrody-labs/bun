export const buckets = ["aphrody-assets"] as const;
export type BucketName = (typeof buckets)[number];

export const isBucket = (name: string): name is BucketName => (buckets as readonly string[]).includes(name);

export function bucketFor(env: Env, name: BucketName): R2Bucket {
  if (!isBucket(name)) throw new TypeError("Unknown public asset bucket");
  return env.APHRODY;
}
