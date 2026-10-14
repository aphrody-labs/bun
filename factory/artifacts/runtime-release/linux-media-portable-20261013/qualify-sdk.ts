import { qualifyLinuxMediaSDK } from "../../../../scripts/aphrody/media-sdk-factory";
import type { MediaSDKTarget } from "../../../../packages/bun-video/src/sdk-platform";

const [target, prefix, receipt] = process.argv.slice(2);
if (!target || !prefix || !receipt) throw new Error("target, prefix and receipt required");
const result = await qualifyLinuxMediaSDK(target as MediaSDKTarget, prefix);
await Bun.write(receipt, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ target, maximumGLIBC: result.maximumGLIBC, members: result.files.length }));
