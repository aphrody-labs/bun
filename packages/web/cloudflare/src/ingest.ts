import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { bucketFor, type BucketName } from "./buckets.ts";

export type IngestParams = { bucket: BucketName; key: string };

/** Records an uploaded R2 object in D1; retried step by step by Workflows. */
export class Ingest extends WorkflowEntrypoint<Env, IngestParams> {
  async run(event: WorkflowEvent<IngestParams>, step: WorkflowStep) {
    const { bucket, key } = event.payload;
    const head = await step.do("head object", async () => {
      const object = await bucketFor(this.env, bucket).head(key);
      if (!object) throw new Error(`missing object ${bucket}/${key}`);
      return {
        size: object.size,
        etag: object.etag,
        contentType: object.httpMetadata?.contentType ?? null,
        uploaded: object.uploaded.getTime(),
      };
    });
    await step.do("record in D1", { retries: { limit: 5, delay: "2 seconds", backoff: "exponential" } }, async () => {
      await this.env.DB.prepare(
        `INSERT INTO files (bucket, key, size, etag, content_type, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (bucket, key) DO UPDATE SET size = excluded.size, etag = excluded.etag,
           content_type = excluded.content_type, uploaded_at = excluded.uploaded_at`,
      )
        .bind(bucket, key, head.size, head.etag, head.contentType, head.uploaded)
        .run();
    });
    return head;
  }
}
