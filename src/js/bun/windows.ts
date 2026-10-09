// Hardcoded module "bun:windows"
//
// Synchronous bindings to Windows 11 system interfaces. The native side lives in
// src/runtime/windows/ (Win32 code in sys/, host functions in host.rs); this file
// validates arguments, parses registry paths and turns the JSON results of the
// native side into objects. Nothing here runs until the module is imported.
const {
  validateInteger,
  validateString,
  validateBoolean,
  validateObject,
  validateOneOf,
} = require("internal/validators");

const isSupported = process.platform === "win32";

const MAX_UINT32 = 4294967295;

const regGetNative = $newRustFunction("windows/host.rs", "jsRegGet", 4);
const regSetNative = $newRustFunction("windows/host.rs", "jsRegSet", 6);
const regCreateKeyNative = $newRustFunction("windows/host.rs", "jsRegCreateKey", 3);
const regDeleteValueNative = $newRustFunction("windows/host.rs", "jsRegDeleteValue", 4);
const regDeleteKeyNative = $newRustFunction("windows/host.rs", "jsRegDeleteKey", 4);
const regListNative = $newRustFunction("windows/host.rs", "jsRegList", 3);
const serviceListNative = $newRustFunction("windows/host.rs", "jsServiceList", 1);
const serviceQueryNative = $newRustFunction("windows/host.rs", "jsServiceQuery", 1);
const serviceStartNative = $newRustFunction("windows/host.rs", "jsServiceStart", 1);
const serviceStopNative = $newRustFunction("windows/host.rs", "jsServiceStop", 1);
const eventLogQueryNative = $newRustFunction("windows/host.rs", "jsEventLogQuery", 4);
const eventLogWriteNative = $newRustFunction("windows/host.rs", "jsEventLogWrite", 4);
const clipboardReadNative = $newRustFunction("windows/host.rs", "jsClipboardRead", 0);
const clipboardWriteNative = $newRustFunction("windows/host.rs", "jsClipboardWrite", 1);
const clipboardClearNative = $newRustFunction("windows/host.rs", "jsClipboardClear", 0);
const knownFolderNative = $newRustFunction("windows/host.rs", "jsKnownFolder", 1);
const versionNative = $newRustFunction("windows/host.rs", "jsVersion", 0);
const systemInfoNative = $newRustFunction("windows/host.rs", "jsSystemInfo", 0);
const isElevatedNative = $newRustFunction("windows/host.rs", "jsIsElevated", 0);
const processListNative = $newRustFunction("windows/host.rs", "jsProcessList", 0);
const processPathNative = $newRustFunction("windows/host.rs", "jsProcessPath", 1);
const processTerminateNative = $newRustFunction("windows/host.rs", "jsProcessTerminate", 2);
const jobCreateNative = $newRustFunction("windows/host.rs", "jsJobCreate", 1);
const jobSetLimitsNative = $newRustFunction("windows/host.rs", "jsJobSetLimits", 6);
const jobAssignNative = $newRustFunction("windows/host.rs", "jsJobAssign", 2);
const jobTerminateNative = $newRustFunction("windows/host.rs", "jsJobTerminate", 2);
const jobInfoNative = $newRustFunction("windows/host.rs", "jsJobInfo", 1);
const jobCloseNative = $newRustFunction("windows/host.rs", "jsJobClose", 1);
const toastNative = $newRustFunction("windows/host.rs", "jsToast", 2);
const wslDistributionsNative = $newRustFunction("windows/host.rs", "jsWslDistributions", 0);
const storageDrivesNative = $newRustFunction("windows/host.rs", "jsStorageDrives", 0);
const memoryStatusNative = $newRustFunction("windows/host.rs", "jsMemoryStatus", 0);

function unsupportedError() {
  const error = new Error("bun:windows is only available on Windows");
  error.code = "ERR_BUN_WINDOWS_UNSUPPORTED";
  return error;
}

function ensureSupported() {
  if (!isSupported) throw unsupportedError();
}

// system

let cachedVersion;

function version() {
  ensureSupported();
  return (cachedVersion ??= Object.freeze(JSON.parse(versionNative())));
}

function isWindows11() {
  return isSupported && version().isWindows11;
}

function systemInfo() {
  ensureSupported();
  return JSON.parse(systemInfoNative());
}

function isElevated() {
  ensureSupported();
  return isElevatedNative();
}

// registry

const REG_NONE = 0;
const REG_SZ = 1;
const REG_EXPAND_SZ = 2;
const REG_BINARY = 3;
const REG_DWORD = 4;
const REG_MULTI_SZ = 7;
const REG_QWORD = 11;

const registryTypes = {
  REG_NONE,
  REG_SZ,
  REG_EXPAND_SZ,
  REG_BINARY,
  REG_DWORD,
  REG_MULTI_SZ,
  REG_QWORD,
};

const registryRoots = {
  HKCR: 0,
  HKEY_CLASSES_ROOT: 0,
  HKCU: 1,
  HKEY_CURRENT_USER: 1,
  HKLM: 2,
  HKEY_LOCAL_MACHINE: 2,
  HKU: 3,
  HKEY_USERS: 3,
  HKCC: 5,
  HKEY_CURRENT_CONFIG: 5,
};

function parseKeyPath(path) {
  validateString(path, "path");
  let normalized = path.replaceAll("/", "\\");
  if (normalized.startsWith("Registry::")) normalized = normalized.slice(10);
  const sep = normalized.indexOf("\\");
  let rootName = (sep === -1 ? normalized : normalized.slice(0, sep)).toUpperCase();
  if (rootName.endsWith(":")) rootName = rootName.slice(0, -1);
  const root = registryRoots[rootName];
  if (root === undefined) {
    throw $ERR_INVALID_ARG_VALUE("path", path, "must start with a registry root such as HKCU or HKLM");
  }
  let subKey = sep === -1 ? "" : normalized.slice(sep + 1);
  while (subKey.endsWith("\\")) subKey = subKey.slice(0, -1);
  return { root, subKey };
}

function viewBits(options) {
  if (options === undefined) return 0;
  validateObject(options, "options");
  const view = options.view;
  if (view === undefined) return 0;
  validateOneOf(view, "options.view", ["64", "32", 64, 32]);
  return view == 64 ? 0x100 : 0x200;
}

function decodeValue(entry) {
  switch (entry.type) {
    case "REG_QWORD":
      entry.value = BigInt(entry.value);
      break;
    case "REG_BINARY":
    case "REG_NONE":
    case "REG_UNKNOWN":
      if (typeof entry.value === "string") entry.value = Buffer.from(entry.value, "hex");
      break;
  }
  return entry;
}

function registryGet(path, name = "", options) {
  ensureSupported();
  const { root, subKey } = parseKeyPath(path);
  validateString(name, "name");
  const json = regGetNative(root, subKey, name, viewBits(options));
  return json === null ? null : decodeValue(JSON.parse(json));
}

function encodeValue(value, type) {
  if (type === undefined) {
    if (typeof value === "string") type = REG_SZ;
    else if (typeof value === "number") type = REG_DWORD;
    else if (typeof value === "bigint") type = REG_QWORD;
    else if ($isArray(value)) type = REG_MULTI_SZ;
    else if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) type = REG_BINARY;
    else throw $ERR_INVALID_ARG_TYPE("value", ["string", "number", "bigint", "string[]", "Uint8Array"], value);
  } else if (typeof type === "string") {
    const resolved = registryTypes[type];
    if (resolved === undefined) throw $ERR_INVALID_ARG_VALUE("type", type);
    type = resolved;
  } else {
    validateInteger(type, "type", 0, MAX_UINT32);
  }
  switch (type) {
    case REG_SZ:
    case REG_EXPAND_SZ:
      validateString(value, "value");
      return [type, value];
    case REG_MULTI_SZ:
      if (!$isArray(value)) throw $ERR_INVALID_ARG_TYPE("value", "string[]", value);
      for (let i = 0; i < value.length; i++) {
        validateString(value[i], `value[${i}]`);
        if (value[i].length === 0 || value[i].includes("\0")) {
          throw $ERR_INVALID_ARG_VALUE(`value[${i}]`, value[i], "must be non-empty and contain no NUL");
        }
      }
      return [type, value.join("\0")];
    case REG_DWORD:
      validateInteger(value, "value", 0, MAX_UINT32);
      return [type, String(value)];
    case REG_QWORD: {
      const big = typeof value === "bigint" ? value : Number.isInteger(value) ? BigInt(value) : undefined;
      if (big === undefined || big < 0n || big > 0xffffffffffffffffn) {
        throw $ERR_OUT_OF_RANGE("value", ">= 0 and <= 2^64 - 1", value);
      }
      return [type, big.toString()];
    }
    case REG_BINARY:
    case REG_NONE: {
      const bytes =
        value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : ArrayBuffer.isView(value)
            ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
            : undefined;
      if (bytes === undefined) throw $ERR_INVALID_ARG_TYPE("value", ["Uint8Array", "ArrayBuffer"], value);
      return [type, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("hex")];
    }
    default:
      throw $ERR_INVALID_ARG_VALUE("type", type, "is not a writable registry type");
  }
}

function registrySet(path, name, value, type, options) {
  ensureSupported();
  const { root, subKey } = parseKeyPath(path);
  validateString(name, "name");
  const [resolvedType, data] = encodeValue(value, type);
  regSetNative(root, subKey, name, resolvedType, data, viewBits(options));
}

function registryCreateKey(path, options) {
  ensureSupported();
  const { root, subKey } = parseKeyPath(path);
  regCreateKeyNative(root, subKey, viewBits(options));
}

function registryDeleteValue(path, name, options) {
  ensureSupported();
  const { root, subKey } = parseKeyPath(path);
  validateString(name, "name");
  return regDeleteValueNative(root, subKey, name, viewBits(options));
}

function registryDeleteKey(path, options) {
  ensureSupported();
  const { root, subKey } = parseKeyPath(path);
  if (subKey === "") throw $ERR_INVALID_ARG_VALUE("path", path, "must not be a registry root");
  const recursive = options?.recursive ?? false;
  validateBoolean(recursive, "options.recursive");
  return regDeleteKeyNative(root, subKey, viewBits(options), recursive);
}

function registryList(path, options) {
  ensureSupported();
  const { root, subKey } = parseKeyPath(path);
  const json = regListNative(root, subKey, viewBits(options));
  if (json === null) return null;
  const listing = JSON.parse(json);
  for (const value of listing.values) decodeValue(value);
  return listing;
}

const registry = Object.freeze({
  types: Object.freeze({ ...registryTypes }),
  get: registryGet,
  set: registrySet,
  createKey: registryCreateKey,
  deleteValue: registryDeleteValue,
  deleteKey: registryDeleteKey,
  list: registryList,
});

// services

const services = Object.freeze({
  list(options) {
    ensureSupported();
    let drivers = false;
    if (options !== undefined) {
      validateObject(options, "options");
      drivers = options.drivers ?? false;
      validateBoolean(drivers, "options.drivers");
    }
    return JSON.parse(serviceListNative(drivers));
  },
  get(name) {
    ensureSupported();
    validateString(name, "name");
    const json = serviceQueryNative(name);
    return json === null ? null : JSON.parse(json);
  },
  start(name) {
    ensureSupported();
    validateString(name, "name");
    serviceStartNative(name);
  },
  stop(name) {
    ensureSupported();
    validateString(name, "name");
    serviceStopNative(name);
  },
});

// event log

const eventTypes = { error: 1, warning: 2, information: 4 };

const eventLog = Object.freeze({
  query(channel = "System", options) {
    ensureSupported();
    validateString(channel, "channel");
    let xpath = "*";
    let limit = 50;
    let newestFirst = true;
    if (options !== undefined) {
      validateObject(options, "options");
      if (options.xpath !== undefined) {
        validateString(options.xpath, "options.xpath");
        xpath = options.xpath;
      }
      if (options.limit !== undefined) {
        validateInteger(options.limit, "options.limit", 0, MAX_UINT32);
        limit = options.limit;
      }
      if (options.newestFirst !== undefined) {
        validateBoolean(options.newestFirst, "options.newestFirst");
        newestFirst = options.newestFirst;
      }
    }
    return JSON.parse(eventLogQueryNative(channel, xpath, limit, newestFirst));
  },
  write(source, message, options) {
    ensureSupported();
    validateString(source, "source");
    validateString(message, "message");
    let type = "information";
    let eventId = 0;
    if (options !== undefined) {
      validateObject(options, "options");
      if (options.type !== undefined) {
        validateOneOf(options.type, "options.type", ["error", "warning", "information"]);
        type = options.type;
      }
      if (options.eventId !== undefined) {
        validateInteger(options.eventId, "options.eventId", 0, 65535);
        eventId = options.eventId;
      }
    }
    eventLogWriteNative(source, eventTypes[type], eventId, message);
  },
});

// clipboard

const clipboard = Object.freeze({
  readText() {
    ensureSupported();
    return clipboardReadNative();
  },
  writeText(text) {
    ensureSupported();
    validateString(text, "text");
    clipboardWriteNative(text);
  },
  clear() {
    ensureSupported();
    clipboardClearNative();
  },
});

// known folders

const knownFolders = Object.freeze({
  Desktop: "B4BFCC3A-DB2C-424C-B029-7FE99A87C641",
  Documents: "FDD39AD0-238F-46AF-ADB4-6C85480369C7",
  Downloads: "374DE290-123F-4565-9164-39C4925E467B",
  Music: "4BD8D571-6D19-48D3-BE97-422220080E43",
  Pictures: "33E28130-4E1E-4676-835A-98395C3BC3BB",
  Videos: "18989B1D-99B5-455B-841C-AB7C74E4DDFC",
  Profile: "5E6C858F-0E22-4760-9AFE-EA3317B67173",
  LocalAppData: "F1B32785-6FBA-4FCF-9D55-7B8E7F157091",
  RoamingAppData: "3EB685DB-65F9-4CF6-A03A-E3EF65729F3D",
  LocalAppDataLow: "A520A1A4-1780-4FF6-BD18-167343C5AF16",
  ProgramData: "62AB5D82-FDC1-4DC3-A9DD-070D1D495D97",
  ProgramFiles: "905E63B6-C1BF-494E-B29C-65B732D3D21A",
  ProgramFilesX86: "7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E",
  ProgramFilesCommon: "F7F1ED05-9F6D-47A2-AAAE-29D317C6F066",
  Windows: "F38BF404-1D43-42F2-9305-67DE0B28FC23",
  System: "1AC14E77-02E7-4E5D-B744-2EB1AE5198B7",
  Fonts: "FD228CB7-AE11-4AE3-864C-16F3910AB8FE",
  StartMenu: "625B53C3-AB48-4EC1-BA1F-A1EF4146FC19",
  Startup: "B97D20BB-F46A-4C97-BA10-5E3608430854",
  Templates: "A63293E8-664E-48DB-A079-DF759E0509F7",
  SavedGames: "4C5C32FF-BB9D-43B0-B5B4-2D72E54EAAA4",
  UserProgramFiles: "5CD7AEE2-2219-4A67-B85D-6C9CE15660CB",
  Public: "DFDF76A2-C82A-4D63-906A-5644AC457385",
});

function knownFolder(nameOrGuid) {
  ensureSupported();
  validateString(nameOrGuid, "name");
  const guid = Object.hasOwn(knownFolders, nameOrGuid) ? knownFolders[nameOrGuid] : nameOrGuid;
  return knownFolderNative(guid);
}

// processes

function pidOf(target, name) {
  const pid = typeof target === "object" && target !== null ? target.pid : target;
  validateInteger(pid, name, 0, MAX_UINT32);
  return pid;
}

const processes = Object.freeze({
  list() {
    ensureSupported();
    return JSON.parse(processListNative());
  },
  path(pid) {
    ensureSupported();
    return processPathNative(pidOf(pid, "pid"));
  },
  terminate(pid, exitCode = 1) {
    ensureSupported();
    validateInteger(exitCode, "exitCode", 0, MAX_UINT32);
    processTerminateNative(pidOf(pid, "pid"), exitCode);
  },
});

// job objects

const jobRegistry = new FinalizationRegistry(id => jobCloseNative(id));

function limitArgs(limits) {
  validateObject(limits, "limits");
  const optional = (value, name, max) => {
    if (value === undefined) return -1;
    validateInteger(value, name, 0, max);
    return value;
  };
  const killOnClose = limits.killOnClose ?? false;
  validateBoolean(killOnClose, "limits.killOnClose");
  const cpuRate = limits.cpuRate;
  if (cpuRate !== undefined && (typeof cpuRate !== "number" || !(cpuRate > 0 && cpuRate <= 100))) {
    throw $ERR_OUT_OF_RANGE("limits.cpuRate", "> 0 and <= 100", cpuRate);
  }
  return [
    killOnClose,
    optional(limits.processMemory, "limits.processMemory", Number.MAX_SAFE_INTEGER),
    optional(limits.jobMemory, "limits.jobMemory", Number.MAX_SAFE_INTEGER),
    optional(limits.activeProcesses, "limits.activeProcesses", MAX_UINT32),
    cpuRate ?? -1,
  ];
}

class Job {
  #id;

  constructor(options) {
    ensureSupported();
    let name;
    if (options !== undefined) {
      validateObject(options, "options");
      name = options.name;
      if (name !== undefined) validateString(name, "options.name");
    }
    this.#id = jobCreateNative(name);
    jobRegistry.register(this, this.#id, this);
    if (options !== undefined) {
      const { name: _, ...limits } = options;
      if (Object.keys(limits).length > 0) this.setLimits(limits);
    }
  }

  #handle() {
    if (this.#id === undefined) throw $ERR_INVALID_STATE("Job is closed");
    return this.#id;
  }

  get closed() {
    return this.#id === undefined;
  }

  setLimits(limits) {
    jobSetLimitsNative(this.#handle(), ...limitArgs(limits));
  }

  assign(target) {
    jobAssignNative(this.#handle(), pidOf(target, "pid"));
  }

  terminate(exitCode = 1) {
    validateInteger(exitCode, "exitCode", 0, MAX_UINT32);
    jobTerminateNative(this.#handle(), exitCode);
  }

  info() {
    return JSON.parse(jobInfoNative(this.#handle()));
  }

  close() {
    if (this.#id === undefined) return;
    jobRegistry.unregister(this);
    jobCloseNative(this.#id);
    this.#id = undefined;
  }

  [Symbol.dispose]() {
    this.close();
  }
}

// notifications

const DEFAULT_APP_ID = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

function escapeXml(text) {
  return text.replace(/[<>&"']/g, c =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&apos;",
  );
}

function appIdOf(options) {
  if (options === undefined) return DEFAULT_APP_ID;
  validateObject(options, "options");
  if (options.appId === undefined) return DEFAULT_APP_ID;
  validateString(options.appId, "options.appId");
  return options.appId;
}

function toast(xml, options) {
  ensureSupported();
  validateString(xml, "xml");
  toastNative(appIdOf(options), xml);
}

function notify(title, body, options) {
  ensureSupported();
  validateString(title, "title");
  if (body !== undefined) validateString(body, "body");
  let xml = `<toast><visual><binding template="ToastGeneric"><text>${escapeXml(title)}</text>`;
  if (body) xml += `<text>${escapeXml(body)}</text>`;
  xml += "</binding></visual></toast>";
  toastNative(appIdOf(options), xml);
}

// WSL

const wsl = Object.freeze({
  distributions() {
    ensureSupported();
    return JSON.parse(wslDistributionsNative());
  },
  run(distribution, command, options) {
    ensureSupported();
    validateString(distribution, "distribution");
    if (!$isArray(command) || command.length === 0) throw $ERR_INVALID_ARG_TYPE("command", "string[]", command);
    for (let i = 0; i < command.length; i++) validateString(command[i], `command[${i}]`);
    const result = Bun.spawnSync({
      cmd: ["wsl.exe", "-d", distribution, "--", ...command],
      stdout: "pipe",
      stderr: "pipe",
      cwd: options?.cwd,
      env: options?.env,
    });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  },
});

const storage = Object.freeze({
  drives() {
    ensureSupported();
    return JSON.parse(storageDrivesNative());
  },
});

const memory = Object.freeze({
  status() {
    ensureSupported();
    return JSON.parse(memoryStatusNative());
  },
});

export default {
  isSupported,
  version,
  isWindows11,
  systemInfo,
  isElevated,
  registry,
  services,
  eventLog,
  clipboard,
  knownFolders,
  knownFolder,
  processes,
  Job,
  toast,
  notify,
  wsl,
  storage,
  memory,
};
