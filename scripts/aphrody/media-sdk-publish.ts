import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { stat } from "node:fs/promises";
import {
  hashSDKFile,
  mediaSDKPlan,
  validateSDKAsset,
  type MediaSDKAsset,
  type MediaSDKComponent,
  type MediaSDKTarget,
} from "../../packages/bun-video/src/sdk";

const PUBLIC = "https://bun-lib.aphrody.app";
const BUCKET = "bun-lib";
const REPOSITORY = "aphrody-labs/bun";
const REST_MAX_BYTES = 300_000_000;

interface TemporarySDKGrant {
  account_id: string;
  bucket: string;
  parentAccessKeyId: string;
  permission: "object-read-write";
  ttlSeconds: number;
  objects: string[];
}
interface TemporarySDKClient {
  user: { tokens: { verify(): Promise<{ id?: string; status?: string }> } };
  r2: {
    temporaryCredentials: {
      create(
        parameters: TemporarySDKGrant,
      ): Promise<{ accessKeyId?: string; secretAccessKey?: string; sessionToken?: string }>;
    };
  };
}

export async function mintSDKUploadOptions(
  client: TemporarySDKClient,
  accountId: string,
  key: string,
): Promise<Bun.S3Options> {
  if (
    !/^[a-f0-9]{32}$/.test(accountId) ||
    !/^(media|native|webkit)\/[A-Za-z0-9._+\/-]+$/.test(key) ||
    key.split("/").some(part => part === "." || part === "..")
  )
    throw new TypeError("SDK temporary credentials require an owned account and object identity");
  const token = await client.user.tokens.verify();
  if (token.status !== "active" || !token.id) throw new Error("Protected Cloudflare control token is not active");
  const temporary = await client.r2.temporaryCredentials.create({
    account_id: accountId,
    bucket: BUCKET,
    parentAccessKeyId: token.id,
    permission: "object-read-write",
    ttlSeconds: 900,
    objects: [key, `${key}.receipt.json`],
  });
  if (!temporary.accessKeyId || !temporary.secretAccessKey || !temporary.sessionToken)
    throw new Error("R2 temporary SDK credential grant is incomplete");
  return {
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    bucket: BUCKET,
    region: "auto",
    accessKeyId: temporary.accessKeyId,
    secretAccessKey: temporary.secretAccessKey,
    sessionToken: temporary.sessionToken,
    partSize: 8,
    queueSize: 1,
    retry: 0,
  };
}

interface Evidence {
  file: string;
  sha256: string;
}
interface NativeQualification {
  schema: 1;
  component: string;
  target: string;
  artifactSha256: string;
  status: "pass";
  checks: { libraryABI: true; cli?: true; nativeProvider?: true; nativeConsumer?: true };
  evidence: Evidence[];
}
interface Distribution {
  schema: 1;
  kind?: "media-sdk" | "native-sdk";
  component: string;
  target: string;
  version: string;
  sourceRevision: string;
  sourceRepository?: string;
  source?: { kind: string; repo: string; commit: string };
  sourceIdentity?: string;
  sourceRoot?: string;
  consumer?: "aphrody-bun";
  buildABI?: {
    os: string;
    arch: string;
    abi?: string;
    asan: boolean;
    lto: boolean;
    baseline: boolean;
    buildType: string;
  };
  includes?: string[];
  libraries?: string[];
  defines?: string[];
  gate?: {
    schema: number;
    nativeLink: string;
    runtimeQualification: string;
    configureSHA256: string;
    ninjaSHA256: string;
    sourceReceiptSHA256: string;
    evidence: string[];
  };
  configureSHA256?: string;
  ninjaSHA256?: string;
  sourceReceiptSHA256?: string;
  qualification?: string;
  licenses: string[];
  files: Record<string, string>;
  asset: MediaSDKAsset;
}

async function readJSON(file: string): Promise<unknown> {
  const source = Bun.file(file);
  if (source.size > 8 * 1024 * 1024) throw new Error("SDK publication receipt exceeded its bound");
  return source.json();
}

export async function mediaPublicationPlan(distributionFile: string, qualificationFile: string, githubTag?: string) {
  const distribution = (await readJSON(distributionFile)) as Distribution;
  const qualification = (await readJSON(qualificationFile)) as NativeQualification;
  if (distribution.schema !== 1 || qualification.schema !== 1)
    throw new Error("Unsupported SDK publication receipt schema");
  const generic = distribution.kind === "native-sdk";
  if (distribution.kind !== undefined && distribution.kind !== "media-sdk" && !generic)
    throw new Error("Unsupported SDK receipt kind");
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(distribution.component) ||
    !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(distribution.target) ||
    !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(distribution.version) ||
    !/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(distribution.sourceRevision)
  )
    throw new Error("SDK receipt lacks a valid component, target, version or immutable source identity");
  if (generic) {
    const abi = distribution.buildABI;
    const gate = distribution.gate;
    if (
      distribution.consumer !== "aphrody-bun" ||
      distribution.sourceRoot !== "source" ||
      !/^[a-f0-9]{64}$/.test(distribution.sourceIdentity ?? "") ||
      distribution.source?.kind !== "github-archive" ||
      distribution.source.commit !== distribution.sourceRevision ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(distribution.source.repo) ||
      distribution.sourceRepository !== `https://github.com/${distribution.source.repo}` ||
      distribution.version !== distribution.sourceRevision ||
      !/^[a-f0-9]{40}$/.test(distribution.sourceRevision) ||
      !abi ||
      `${abi.os}-${abi.arch}` !== distribution.target ||
      typeof abi.asan !== "boolean" ||
      typeof abi.lto !== "boolean" ||
      typeof abi.baseline !== "boolean" ||
      typeof abi.buildType !== "string" ||
      !abi.buildType ||
      abi.buildType.length > 64 ||
      (abi.abi !== undefined && !/^[a-z0-9_-]+$/.test(abi.abi))
    )
      throw new Error("Native SDK requires its exact Bun consumer and explicit build ABI profile");
    if (
      !gate ||
      gate.schema !== 1 ||
      gate.nativeLink !== "passed" ||
      !["native-tests-passed", "wine-smoke-passed"].includes(gate.runtimeQualification) ||
      distribution.qualification !== gate.runtimeQualification ||
      !/^[a-f0-9]{64}$/.test(gate.configureSHA256) ||
      !/^[a-f0-9]{64}$/.test(gate.ninjaSHA256) ||
      !/^[a-f0-9]{64}$/.test(gate.sourceReceiptSHA256) ||
      gate.configureSHA256 !== distribution.configureSHA256 ||
      gate.ninjaSHA256 !== distribution.ninjaSHA256 ||
      gate.sourceReceiptSHA256 !== distribution.sourceReceiptSHA256 ||
      !Array.isArray(gate.evidence) ||
      !gate.evidence.length ||
      gate.evidence.length > 32 ||
      gate.evidence.some(value => typeof value !== "string" || !value || value.length > 1024)
    )
      throw new Error("Native SDK lacks the matching linked build and runtime gate receipt");
    for (const list of [distribution.includes, distribution.libraries, distribution.defines])
      if (!Array.isArray(list) || list.some(value => typeof value !== "string" || value.length > 4096))
        throw new Error("Native SDK public build contract is incomplete");
    if (!distribution.includes!.length || !distribution.libraries!.length)
      throw new Error("Native SDK lacks its headers or libraries");
    const repository = new URL(distribution.sourceRepository ?? "");
    if (
      repository.protocol !== "https:" ||
      repository.hostname !== "github.com" ||
      repository.username ||
      repository.password ||
      repository.search ||
      repository.hash
    )
      throw new Error("Native SDK source repository must remain its public owner URL");
  }
  if (!generic) {
    const expected = mediaSDKPlan(distribution.component as MediaSDKComponent, distribution.target as MediaSDKTarget);
    if (distribution.sourceRevision !== expected.sourceRevision || distribution.version !== expected.version)
      throw new Error("SDK publication source differs from its owner pin");
    validateSDKAsset(distribution.asset);
  } else {
    const assetURL = new URL(distribution.asset.url);
    if (
      assetURL.protocol !== "https:" ||
      assetURL.username ||
      assetURL.password ||
      assetURL.search ||
      assetURL.hash ||
      !/^[a-f0-9]{64}$/.test(distribution.asset.sha256) ||
      !Number.isSafeInteger(distribution.asset.bytes) ||
      distribution.asset.bytes < 1 ||
      distribution.asset.bytes > 2 * 1024 * 1024 * 1024
    )
      throw new Error("Generic SDK asset requires an unsigned HTTPS URL, SHA-256 and bounded exact size");
  }
  const url = new URL(distribution.asset.url);
  const filename = generic
    ? basename(url.pathname)
    : `${distribution.component}-${distribution.version}-${distribution.target}-sdk.zip`;
  if (
    !/^[A-Za-z0-9._+-]+$/.test(filename) ||
    url.origin !== PUBLIC ||
    (!generic
      ? url.pathname !== `/media/${filename}`
      : !/^\/(sdk|native)\/[A-Za-z0-9._+-]+\.zip$/.test(url.pathname)) ||
    distribution.asset.format !== "zip"
  )
    throw new Error("SDK publication must use its normalized ZIP identity on the owned domain");
  if (
    !Array.isArray(distribution.licenses) ||
    !distribution.licenses.length ||
    !distribution.files ||
    typeof distribution.files !== "object"
  )
    throw new Error("SDK publication requires file hashes and retained license notices");
  for (const [name, hash] of Object.entries(distribution.files)) {
    if (
      !name ||
      name.includes("\\") ||
      name.startsWith("/") ||
      /^[A-Za-z]:/.test(name) ||
      name.split("/").includes("..") ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      throw new Error("SDK receipt contains an invalid file identity");
  }
  if (distribution.licenses.some(name => !Object.hasOwn(distribution.files, name)))
    throw new Error("SDK license notices lack pinned file identities");
  const artifact = join(dirname(distributionFile), filename);
  if (
    (await stat(artifact)).size !== distribution.asset.bytes ||
    (await hashSDKFile(artifact)) !== distribution.asset.sha256
  )
    throw new Error("SDK ZIP changed since its factory receipt");
  const receiptName = generic ? "bun-native-sdk.json" : "bun-sdk-receipt.json";
  const embedded = (await new Bun.Archive(await Bun.file(artifact).bytes()).files(receiptName)).get(receiptName);
  if (!embedded || embedded.size > 8 * 1024 * 1024) throw new Error("SDK ZIP lacks its bounded embedded owner receipt");
  const inside = (await embedded.json()) as Distribution;
  if (
    inside.schema !== distribution.schema ||
    inside.component !== distribution.component ||
    inside.target !== distribution.target ||
    inside.sourceRevision !== distribution.sourceRevision ||
    inside.version !== distribution.version ||
    !inside.files ||
    Object.keys(inside.files).length !== Object.keys(distribution.files).length ||
    Object.entries(distribution.files).some(([name, hash]) => inside.files[name] !== hash) ||
    !Array.isArray(inside.licenses) ||
    inside.licenses.length !== distribution.licenses.length ||
    distribution.licenses.some(name => !inside.licenses.includes(name))
  )
    throw new Error("SDK ZIP receipt differs from its distribution file identities");
  if (
    generic &&
    (inside.consumer !== distribution.consumer ||
      inside.sourceRoot !== distribution.sourceRoot ||
      inside.sourceIdentity !== distribution.sourceIdentity ||
      JSON.stringify(inside.source) !== JSON.stringify(distribution.source) ||
      JSON.stringify(inside.buildABI) !== JSON.stringify(distribution.buildABI) ||
      JSON.stringify(inside.gate) !== JSON.stringify(distribution.gate) ||
      JSON.stringify(inside.includes) !== JSON.stringify(distribution.includes) ||
      JSON.stringify(inside.libraries) !== JSON.stringify(distribution.libraries) ||
      JSON.stringify(inside.defines) !== JSON.stringify(distribution.defines))
  )
    throw new Error("SDK ZIP build ABI differs from its distribution contract");
  if (generic) {
    const identity = new Bun.CryptoHasher("sha256").update(JSON.stringify(inside)).digest("hex");
    if (filename !== `${distribution.component}-${distribution.target}-${identity.slice(0, 16)}-sdk.zip`)
      throw new Error("Native SDK filename is not bound to its embedded build profile");
  }
  if (
    qualification.component !== distribution.component ||
    qualification.target !== distribution.target ||
    qualification.artifactSha256 !== distribution.asset.sha256 ||
    qualification.status !== "pass" ||
    qualification.checks?.libraryABI !== true ||
    (generic
      ? qualification.checks?.nativeConsumer !== true
      : qualification.checks?.cli !== true || qualification.checks?.nativeProvider !== true)
  )
    throw new Error("SDK lacks successful artifact-bound native ABI and consumer qualification");
  if (!Array.isArray(qualification.evidence) || !qualification.evidence.length || qualification.evidence.length > 32)
    throw new Error("SDK native qualification requires bounded gate evidence");
  const evidenceHashes: string[] = [];
  for (const evidence of qualification.evidence) {
    if (!evidence || typeof evidence.file !== "string" || !/^[a-f0-9]{64}$/.test(evidence.sha256))
      throw new Error("Invalid SDK qualification evidence");
    const file = isAbsolute(evidence.file) ? evidence.file : resolve(dirname(qualificationFile), evidence.file);
    if ((await hashSDKFile(file)) !== evidence.sha256) throw new Error("SDK native qualification evidence changed");
    evidenceHashes.push(evidence.sha256);
  }
  if (githubTag !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(githubTag))
    throw new TypeError("Invalid SDK GitHub release tag");
  const receipt = {
    schema: 1,
    kind: generic ? "native-sdk" : "media-sdk",
    component: distribution.component,
    target: distribution.target,
    version: distribution.version,
    sourceRevision: distribution.sourceRevision,
    asset: distribution.asset,
    files: distribution.files,
    licenses: distribution.licenses,
    qualification: generic ? distribution.qualification : "native-sdk-qualified",
    nativeRuntimeABI: generic ? "same-Bun-build-ABI-qualified" : "qualified",
    ...(generic
      ? {
          consumer: distribution.consumer,
          sourceRepository: distribution.sourceRepository,
          source: distribution.source,
          sourceIdentity: distribution.sourceIdentity,
          sourceRoot: distribution.sourceRoot,
          buildABI: distribution.buildABI,
          includes: distribution.includes,
          libraries: distribution.libraries,
          defines: distribution.defines,
          gate: distribution.gate,
          configureSHA256: distribution.configureSHA256,
          ninjaSHA256: distribution.ninjaSHA256,
          sourceReceiptSHA256: distribution.sourceReceiptSHA256,
        }
      : {}),
    nativeQualification: {
      checks: generic
        ? { libraryABI: true, nativeConsumer: true }
        : { libraryABI: true, cli: true, nativeProvider: true },
      evidenceSHA256: evidenceHashes,
    },
  };
  return { artifact, key: url.pathname.slice(1), url: distribution.asset.url, githubTag, receipt };
}

export async function verifyPublishedSDK(url: string, expected: { sha256: string; bytes: number }): Promise<void> {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(300_000), cache: "no-store" });
  if (!response.ok || !response.body) throw new Error(`Public SDK verification failed (${response.status})`);
  const hash = new Bun.CryptoHasher("sha256");
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > expected.bytes) throw new Error("Published SDK exceeded its pinned size");
    hash.update(chunk);
  }
  if (bytes !== expected.bytes || hash.digest("hex") !== expected.sha256)
    throw new Error("Published SDK SHA-256 or size mismatch");
}

export async function loadVerifiedPublicationPlan(
  file: string,
  artifact: string,
): Promise<Awaited<ReturnType<typeof mediaPublicationPlan>>> {
  const envelope = (await readJSON(file)) as {
    schema: number;
    fingerprint: string;
    plan: Awaited<ReturnType<typeof mediaPublicationPlan>>;
  };
  if (
    envelope.schema !== 1 ||
    !envelope.plan ||
    !/^[a-f0-9]{64}$/.test(envelope.fingerprint) ||
    new Bun.CryptoHasher("sha256").update(JSON.stringify(envelope.plan)).digest("hex") !== envelope.fingerprint
  )
    throw new Error("Verified SDK publication plan changed during transfer");
  const plan = envelope.plan;
  const url = new URL(plan.url);
  if (
    url.origin !== PUBLIC ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.slice(1) !== plan.key ||
    !/^\/(media|native)\/[A-Za-z0-9._+-]+\.zip$/.test(url.pathname) ||
    plan.receipt.asset.url !== plan.url ||
    plan.receipt.schema !== 1 ||
    !/^[a-f0-9]{64}$/.test(plan.receipt.asset.sha256) ||
    !Number.isSafeInteger(plan.receipt.asset.bytes) ||
    plan.receipt.asset.bytes < 1 ||
    plan.receipt.asset.bytes > 2 * 1024 * 1024 * 1024 ||
    !["same-Bun-build-ABI-qualified", "qualified"].includes(plan.receipt.nativeRuntimeABI) ||
    !plan.receipt.nativeQualification.evidenceSHA256.length ||
    plan.receipt.nativeQualification.checks.libraryABI !== true
  )
    throw new Error("Verified SDK plan lacks its owned artifact and native qualification");
  const local = resolve(artifact);
  if (
    basename(local) !== basename(url.pathname) ||
    (await stat(local)).size !== plan.receipt.asset.bytes ||
    (await hashSDKFile(local)) !== plan.receipt.asset.sha256
  )
    throw new Error("Transferred SDK artifact differs from its verified plan");
  return { ...plan, artifact: local };
}

async function github(argv: string[]): Promise<string> {
  const gh = Bun.which("gh");
  if (!gh) throw new Error("SDK GitHub publication requires the installed native gh owner");
  await using child = Bun.spawn([gh, ...argv], {
    stdout: "pipe",
    stderr: "ignore",
    timeout: 300_000,
    killSignal: "SIGKILL",
  });
  const output = await child.stdout.text();
  if ((await child.exited) !== 0) throw new Error("SDK GitHub publication command failed");
  return output;
}

export async function publishedSDKExists(url: string, asset: { bytes: number; sha256: string }): Promise<boolean> {
  const response = await fetch(url, {
    method: "HEAD",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`SDK publication preflight failed: HTTP ${response.status}`);
  await verifyPublishedSDK(url, asset);
  return true;
}

export async function publishMediaSDK(plan: Awaited<ReturnType<typeof mediaPublicationPlan>>) {
  if (
    (await stat(plan.artifact)).size !== plan.receipt.asset.bytes ||
    (await hashSDKFile(plan.artifact)) !== plan.receipt.asset.sha256
  )
    throw new Error("SDK artifact changed before publication");
  const { createClient, credentialsFromEnv, loadCloudflareEnvironment } = await import("../../packages/bun-cloudflare/src/api");
  const env = await loadCloudflareEnvironment();
  const credentials = credentialsFromEnv(env);
  if (!credentials.accountId) throw new Error("Protected Cloudflare account configuration is missing");
  const client = createClient({ credentials, timeout: 300_000, maxRetries: 0, logLevel: "off" });
  const parameters = { account_id: credentials.accountId, bucket_name: BUCKET };
  const exists = await publishedSDKExists(plan.url, plan.receipt.asset);
  if (!exists && plan.receipt.asset.bytes <= REST_MAX_BYTES)
    await client.r2.buckets.objects.upload(plan.key, Bun.file(plan.artifact), parameters);
  else if (!exists) {
    if (env.BUN_LIB_R2_ENDPOINT && env.BUN_LIB_R2_ACCESS_KEY_ID && env.BUN_LIB_R2_SECRET_ACCESS_KEY) {
      const s3 = new Bun.S3Client({
        bucket: BUCKET,
        endpoint: env.BUN_LIB_R2_ENDPOINT,
        accessKeyId: env.BUN_LIB_R2_ACCESS_KEY_ID,
        secretAccessKey: env.BUN_LIB_R2_SECRET_ACCESS_KEY,
        sessionToken: env.BUN_LIB_R2_SESSION_TOKEN,
        region: "auto",
        partSize: 8,
        queueSize: 1,
        retry: 0,
      });
      await s3.file(plan.key).write(Bun.file(plan.artifact));
    } else {
      const s3 = new Bun.S3Client(await mintSDKUploadOptions(client, credentials.accountId, plan.key));
      await s3.file(plan.key).write(Bun.file(plan.artifact));
    }
  }
  await verifyPublishedSDK(plan.url, plan.receipt.asset);
  const receiptFile = join(dirname(plan.artifact), `${basename(plan.artifact)}.receipt.json`);
  const receipt = JSON.stringify(plan.receipt, null, 2);
  await Bun.write(receiptFile, receipt);
  const receiptIdentity = {
    bytes: Bun.file(receiptFile).size,
    sha256: await hashSDKFile(receiptFile),
  };
  if (!(await publishedSDKExists(`${plan.url}.receipt.json`, receiptIdentity)))
    await client.r2.buckets.objects.upload(`${plan.key}.receipt.json`, Bun.file(receiptFile), parameters);
  await verifyPublishedSDK(`${plan.url}.receipt.json`, receiptIdentity);
  if (plan.githubTag) {
    await github(["release", "upload", plan.githubTag, plan.artifact, receiptFile, "--repo", REPOSITORY]);
    const release = JSON.parse(await github(["api", `repos/${REPOSITORY}/releases/tags/${plan.githubTag}`])) as {
      draft: boolean;
      assets: { name: string; size: number; digest?: string }[];
    };
    if (release.draft) throw new Error("SDK GitHub release remains a draft");
    for (const file of [plan.artifact, receiptFile]) {
      const asset = release.assets.find(asset => asset.name === basename(file));
      if (!asset || asset.size !== Bun.file(file).size || asset.digest !== `sha256:${await hashSDKFile(file)}`)
        throw new Error("SDK GitHub release asset failed digest verification");
    }
  }
  return {
    url: plan.url,
    sha256: plan.receipt.asset.sha256,
    bytes: plan.receipt.asset.bytes,
    githubTag: plan.githubTag,
  };
}

if (import.meta.main) {
  const [action = "plan", distribution, qualification, fourth, fifth] = process.argv.slice(2);
  if (!["plan", "apply", "export-plan", "apply-verified"].includes(action) || !distribution || !qualification)
    throw new TypeError(
      "usage: media-sdk-publish.ts plan|apply <distribution.json> <native-qualification.json> [github-tag] | export-plan <distribution.json> <qualification.json> <plan.json> [github-tag] | apply-verified <plan.json> <local-sdk.zip>",
    );
  const plan =
    action === "apply-verified"
      ? await loadVerifiedPublicationPlan(resolve(distribution), resolve(qualification))
      : await mediaPublicationPlan(
          resolve(distribution),
          resolve(qualification),
          action === "export-plan" ? fifth : fourth,
        );
  if (action === "export-plan") {
    if (!fourth) throw new TypeError("export-plan requires an explicit output file");
    await Bun.write(
      resolve(fourth),
      JSON.stringify(
        { schema: 1, fingerprint: new Bun.CryptoHasher("sha256").update(JSON.stringify(plan)).digest("hex"), plan },
        null,
        2,
      ),
    );
  }
  console.log(
    JSON.stringify(
      action === "apply" || action === "apply-verified"
        ? await publishMediaSDK(plan)
        : {
            action,
            key: plan.key,
            url: plan.url,
            sha256: plan.receipt.asset.sha256,
            bytes: plan.receipt.asset.bytes,
            githubTag: plan.githubTag,
          },
      null,
      2,
    ),
  );
}
