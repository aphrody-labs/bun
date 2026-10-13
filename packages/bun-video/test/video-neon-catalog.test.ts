import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNeonClient } from "../../bun-plugin-neon/src";
import { VideoCatalog } from "../src/video-catalog";
import { NeonVideoCatalog } from "../src/video-neon-catalog";
import { importVideoCatalog, snapshotVideoCatalog } from "../src/video-neon-migrate";
import { VideoWorkerPool } from "../src/video-workers";
import type { VideoRenderTask } from "../src/video-worker-task";

const connectionString = Bun.env.BUN_VIDEO_NEON_TEST_URL;

test.skipIf(!connectionString)(
  "synthetic catalog imports and worker writes stay in one Neon branch",
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "bun-video-neon-live-"));
    const path = join(directory, "fixture.sqlite");
    try {
      using fixture = new VideoCatalog(path);
      fixture.registerProvider({ id: "synthetic", name: "Synthetic", family: "test" });
      const snapshot = snapshotVideoCatalog(path);
      const sql = createNeonClient({
        connectionString,
        expectedHostname: new URL(connectionString!).hostname,
        expectedDatabase: "bun_video",
        requireDirect: true,
      });
      try {
        const imported = await importVideoCatalog(sql, snapshot);
        expect(imported.digest).toBe(snapshot.digest);
        const catalog = await NeonVideoCatalog.open(sql);
        expect((await catalog.listProviders()).map(provider => provider.id)).toContain("synthetic");
        const task: VideoRenderTask = {
          source: { kind: "file", value: path },
          engine: "remotion",
          output: join(directory, "synthetic.mp4"),
          width: 320,
          height: 180,
          fps: 30,
          durationFrames: 1,
          frameWorkers: 1,
        };
        await using workers = new VideoWorkerPool({
          catalog,
          workers: 1,
          workRoot: directory,
          runner: async input => ({
            output: input.output,
            engine: input.engine,
            sourcePath: input.source.value,
            compositionEntry: input.source.value,
            frames: 1,
            sha256: "00".repeat(32),
            bytes: 1,
          }),
        });
        await workers.submit(task);
        expect((await catalog.listJobs("completed")).length).toBe(1);
        expect((await catalog.listArtifacts()).length).toBe(1);
        expect((await catalog.listSources()).length).toBe(1);
      } finally {
        await sql.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  30000,
);
