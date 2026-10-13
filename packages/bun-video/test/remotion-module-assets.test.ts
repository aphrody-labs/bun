import { expect, test } from "bun:test";
import { rewriteIsolatedTypeExports } from "../packages/remotion/.aphrody/module-assets";

test("isolated Remotion assets erase referenced types while retaining runtime exports", async () => {
  const path = Bun.fileURLToPath(new URL("../packages/remotion/packages/media-utils/src/index.ts", import.meta.url));
  const source = rewriteIsolatedTypeExports(await Bun.file(path).text(), path);
  expect(source).toContain("type UseAudioDataOptions");
  expect(source).toContain("useAudioData");
  const result = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  expect(result).not.toContain("UseAudioDataOptions");
  expect(result).toContain("useAudioData");
  const licensingPath = Bun.fileURLToPath(
    new URL("../packages/remotion/packages/licensing/src/index.ts", import.meta.url),
  );
  const alias = rewriteIsolatedTypeExports(
    "export {UsageEventClassification as Classification, registerUsageEvent} from './register-usage-event';",
    licensingPath,
  );
  expect(alias).toContain("type UsageEventClassification as Classification");
  expect(new Bun.Transpiler({ loader: "ts" }).transformSync(alias)).not.toContain("Classification");
  const pathsFile = Bun.fileURLToPath(new URL("../packages/remotion/packages/paths/src/index.ts", import.meta.url));
  const indirect = rewriteIsolatedTypeExports(await Bun.file(pathsFile).text(), pathsFile);
  expect(indirect).toContain("type WarpPathFn");
  expect(new Bun.Transpiler({ loader: "ts" }).transformSync(indirect)).not.toContain("WarpPathFn");
  const rendererFile = Bun.fileURLToPath(
    new URL("../packages/remotion/packages/renderer/src/index.ts", import.meta.url),
  );
  const renderer = rewriteIsolatedTypeExports("export {AvailableOptions} from './options';", rendererFile);
  expect(renderer).toContain("type AvailableOptions");
  expect(new Bun.Transpiler({ loader: "ts" }).transformSync(renderer)).not.toContain("AvailableOptions");
});
