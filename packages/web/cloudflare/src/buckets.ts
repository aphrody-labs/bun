import { buckets, isBucket } from "./core.ts";

export { buckets, isBucket };
export type BucketName = (typeof buckets)[number];

export function bucketFor(env: Env, name: BucketName): R2Bucket {
  if (!isBucket(name)) throw new TypeError("Unknown public asset bucket");
  return env.APHRODY;
}
