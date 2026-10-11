import { win32 } from "node:path";

export interface WindowsServicePlanOptions {
  name: string;
  nssmPath: string;
  executable: string;
  args?: string[];
  directory: string;
  /** Set from a separately observed Windows service inventory. */
  existing?: boolean;
  displayName?: string;
  description?: string;
  start?: "automatic" | "manual";
  stdout?: string;
  stderr?: string;
  restartDelayMs?: number;
}

function windowsPath(value: string, name: string): string {
  if (typeof value !== "string" || !win32.isAbsolute(value) || /[\0\r\n"]/.test(value)) {
    throw new Error(`${name} must be an absolute Windows path`);
  }
  return value;
}

function argument(value: string): string {
  if (typeof value !== "string" || /[\0\r\n]/.test(value))
    throw new Error("Invalid Windows service argument");
  if (value && !/[\s"]/.test(value)) return value;
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1")}"`;
}

/** Produces argv arrays for caller-reviewed NSSM configuration; never spawns or installs anything. */
export function planWindowsService(options: WindowsServicePlanOptions) {
  if (typeof options.name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(options.name))
    throw new Error("Invalid Windows service name");
  const nssm = windowsPath(options.nssmPath, "nssmPath");
  const executable = windowsPath(options.executable, "executable");
  const directory = windowsPath(options.directory, "directory");
  if (options.start !== undefined && options.start !== "automatic" && options.start !== "manual")
    throw new Error("Invalid service start policy");
  const delay = options.restartDelayMs ?? 5000;
  if (!Number.isSafeInteger(delay) || delay < 0 || delay > 2_147_483_647)
    throw new Error("Invalid restartDelayMs");
  for (const value of [options.displayName, options.description]) {
    if (value !== undefined && (typeof value !== "string" || /[\0\r\n]/.test(value)))
      throw new Error("Invalid service metadata");
  }
  const commands: string[][] = [];
  if (!options.existing) commands.push([nssm, "install", options.name, executable]);
  const values: [string, string[]][] = [
    ["Application", [executable]],
    ["AppParameters", [(options.args ?? []).map(argument).join(" ")]],
    ["AppDirectory", [directory]],
    ["Start", [options.start === "manual" ? "SERVICE_DEMAND_START" : "SERVICE_AUTO_START"]],
    ["AppExit", ["Default", "Restart"]],
    ["AppRestartDelay", [String(delay)]],
    ["AppKillProcessTree", ["1"]],
  ];
  if (options.displayName !== undefined) values.push(["DisplayName", [options.displayName]]);
  if (options.description !== undefined) values.push(["Description", [options.description]]);
  if (options.stdout !== undefined)
    values.push(["AppStdout", [windowsPath(options.stdout, "stdout")]]);
  if (options.stderr !== undefined)
    values.push(["AppStderr", [windowsPath(options.stderr, "stderr")]]);
  for (const [key, value] of values) commands.push([nssm, "set", options.name, key, ...value]);
  return { service: options.name, requiresAdministrator: true, startsService: false, commands };
}
