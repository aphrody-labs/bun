/**
 * Native Windows interfaces: registry, services, event log, clipboard, known folders,
 * processes, Job Objects, toast notifications and WSL.
 *
 * Every function is synchronous and throws a `SystemError` when the Windows call fails.
 * The error carries `code` (the libuv-style code such as `"EACCES"`), `syscall` (the Win32
 * function) and `winError` (the raw `GetLastError` or `HRESULT` value). On other platforms
 * {@link isSupported} is `false` and every call throws an error with code
 * `ERR_BUN_WINDOWS_UNSUPPORTED`.
 *
 * @example
 * ```ts
 * import windows from "bun:windows";
 *
 * if (windows.isSupported) {
 *   console.log(windows.version().productName);
 *   console.log(windows.knownFolder("Downloads"));
 * }
 * ```
 *
 * @category Windows
 */
declare module "bun:windows" {
  /** Result of {@link version}. */
  interface WindowsVersion {
    major: number;
    minor: number;
    build: number;
    /** Update build revision, the number after the last dot of `ver`. */
    ubr: number;
    /** `"major.minor.build.ubr"`. */
    version: string;
    /** Feature update name such as `"24H2"`, or `""`. */
    displayVersion: string;
    /** Product name, with `"Windows 10"` corrected to `"Windows 11"` on builds 22000 and later. */
    productName: string;
    /** Edition such as `"Professional"` or `"Core"`. */
    edition: string;
    /** `"Client"`, `"Server"` or `"Server Core"`. */
    installationType: string;
    isWindows11: boolean;
    /** Architecture of the running process: `"x64"`, `"arm64"` or `"ia32"`. */
    arch: string;
    /** Architecture of the machine, which differs from `arch` under emulation. */
    nativeArch: string;
  }

  /** Result of {@link systemInfo}. */
  interface WindowsSystemInfo {
    computerName: string;
    userName: string;
    /** Logical processors. */
    processors: number;
    /** Physical memory in bytes. */
    totalMemory: number;
    /** Available physical memory in bytes. */
    freeMemory: number;
    /** Percentage of physical memory in use. */
    memoryLoad: number;
    /** Milliseconds since boot. */
    uptime: number;
    /** App color mode chosen in Settings. */
    theme: "dark" | "light";
  }

  type RegistryValueType =
    | "REG_NONE"
    | "REG_SZ"
    | "REG_EXPAND_SZ"
    | "REG_BINARY"
    | "REG_DWORD"
    | "REG_DWORD_BIG_ENDIAN"
    | "REG_LINK"
    | "REG_MULTI_SZ"
    | "REG_QWORD"
    | "REG_UNKNOWN";

  /** A registry value: `REG_QWORD` reads as a `bigint`, binary types as a `Buffer`. */
  interface RegistryValue {
    type: RegistryValueType;
    value: string | string[] | number | bigint | Buffer;
  }

  interface RegistryListing {
    /** Names of the subkeys. */
    keys: string[];
    values: Array<RegistryValue & { name: string }>;
  }

  interface RegistryOptions {
    /** Registry view to open: `"64"` (`KEY_WOW64_64KEY`) or `"32"` (`KEY_WOW64_32KEY`). Defaults to the view of the process. */
    view?: "64" | "32" | 64 | 32;
  }

  /**
   * Registry access. A path starts with a root (`HKCR`, `HKCU`, `HKLM`, `HKU`, `HKCC` or the
   * long `HKEY_*` names, optionally followed by `:`) and uses `\` or `/` as separator:
   * `"HKCU\\Software\\MyApp"`.
   */
  namespace registry {
    /** Numeric `REG_*` types accepted by {@link set}. */
    const types: {
      readonly REG_NONE: 0;
      readonly REG_SZ: 1;
      readonly REG_EXPAND_SZ: 2;
      readonly REG_BINARY: 3;
      readonly REG_DWORD: 4;
      readonly REG_MULTI_SZ: 7;
      readonly REG_QWORD: 11;
    };
    /** Reads a value. `name` defaults to `""`, the default value of the key. Returns `null` when the key or value does not exist. */
    function get(path: string, name?: string, options?: RegistryOptions): RegistryValue | null;
    /**
     * Writes a value, creating the key if needed. Without `type`, a string is written as
     * `REG_SZ`, a number as `REG_DWORD`, a `bigint` as `REG_QWORD`, a string array as
     * `REG_MULTI_SZ` and bytes as `REG_BINARY`.
     */
    function set(
      path: string,
      name: string,
      value: string | string[] | number | bigint | ArrayBufferView | ArrayBuffer,
      type?: keyof typeof types | number,
      options?: RegistryOptions,
    ): void;
    /** Creates a key and its missing parents. */
    function createKey(path: string, options?: RegistryOptions): void;
    /** Deletes a value. Returns `false` when it did not exist. */
    function deleteValue(path: string, name: string, options?: RegistryOptions): boolean;
    /** Deletes a key. Without `recursive`, a key with subkeys cannot be deleted. Returns `false` when it did not exist. */
    function deleteKey(path: string, options?: RegistryOptions & { recursive?: boolean }): boolean;
    /** Subkeys and values of a key, or `null` when it does not exist. */
    function list(path: string, options?: RegistryOptions): RegistryListing | null;
  }

  type ServiceState =
    | "stopped"
    | "start-pending"
    | "stop-pending"
    | "running"
    | "continue-pending"
    | "pause-pending"
    | "paused"
    | "unknown";

  type ServiceType = "kernel-driver" | "file-system-driver" | "own-process" | "share-process" | "other";

  interface ServiceSummary {
    name: string;
    displayName: string;
    state: ServiceState;
    type: ServiceType;
    /** Process id, `0` when not running. */
    pid: number;
  }

  interface ServiceDetails extends ServiceSummary {
    startType: "boot" | "system" | "auto" | "manual" | "disabled" | "unknown";
    binaryPath: string;
    /** Account the service runs as. */
    account: string;
    /** Win32 exit code of the last stop. */
    exitCode: number;
    /** Names of the services this one depends on. */
    dependencies: string[];
  }

  /** Service Control Manager. Starting and stopping services usually needs an elevated process. */
  namespace services {
    /** Every Win32 service, or every driver with `drivers: true`. */
    function list(options?: { drivers?: boolean }): ServiceSummary[];
    /** One service, or `null` when it does not exist. */
    function get(name: string): ServiceDetails | null;
    /** Starts a service. Starting a running service is not an error. */
    function start(name: string): void;
    /** Stops a service. Stopping a stopped service is not an error. */
    function stop(name: string): void;
  }

  /** Windows Event Log. */
  namespace eventLog {
    /**
     * Reads events from a channel (`"System"`, `"Application"`,
     * `"Microsoft-Windows-PowerShell/Operational"`…) and returns their XML.
     * Some channels such as `"Security"` need an elevated process.
     */
    function query(
      channel?: string,
      options?: {
        /** XPath filter, for example `"*[System[(Level=2)]]"`. Defaults to `"*"`. */
        xpath?: string;
        /** Maximum number of events. Defaults to `50`. */
        limit?: number;
        /** Defaults to `true`. */
        newestFirst?: boolean;
      },
    ): string[];
    /** Writes an event to the Application log under `source`. */
    function write(
      source: string,
      message: string,
      options?: { type?: "error" | "warning" | "information"; eventId?: number },
    ): void;
  }

  /** Text clipboard (`CF_UNICODETEXT`). */
  namespace clipboard {
    /** Clipboard text, or `null` when the clipboard holds no text. */
    function readText(): string | null;
    function writeText(text: string): void;
    function clear(): void;
  }

  /** GUIDs of common known folders, accepted by name by {@link knownFolder}. */
  const knownFolders: {
    readonly Desktop: string;
    readonly Documents: string;
    readonly Downloads: string;
    readonly Music: string;
    readonly Pictures: string;
    readonly Videos: string;
    readonly Profile: string;
    readonly LocalAppData: string;
    readonly RoamingAppData: string;
    readonly LocalAppDataLow: string;
    readonly ProgramData: string;
    readonly ProgramFiles: string;
    readonly ProgramFilesX86: string;
    readonly ProgramFilesCommon: string;
    readonly Windows: string;
    readonly System: string;
    readonly Fonts: string;
    readonly StartMenu: string;
    readonly Startup: string;
    readonly Templates: string;
    readonly SavedGames: string;
    readonly UserProgramFiles: string;
    readonly Public: string;
  };

  /** Path of a known folder (`SHGetKnownFolderPath`), given a name of {@link knownFolders} or a `KNOWNFOLDERID` GUID. */
  function knownFolder(nameOrGuid: keyof typeof knownFolders | (string & {})): string;

  interface ProcessEntry {
    pid: number;
    /** Parent process id. */
    ppid: number;
    /** Executable file name. */
    name: string;
    threads: number;
  }

  /** Processes of the machine. A `pid` argument also accepts an object with a `pid` property, such as a `Subprocess`. */
  namespace processes {
    function list(): ProcessEntry[];
    /** Full path of the executable of a process. */
    function path(pid: number | { pid: number }): string;
    /** Terminates a process with `exitCode` (default `1`). */
    function terminate(pid: number | { pid: number }, exitCode?: number): void;
    /** Sets the process affinity within its current processor group. `mask` is a positive safe integer bitmask. */
    function setAffinity(pid: number | { pid: number }, mask: number): void;
    /** Sets a documented Windows process priority class. `realtime` usually requires elevation. */
    function setPriority(
      pid: number | { pid: number },
      priority: "idle" | "below-normal" | "normal" | "above-normal" | "high" | "realtime",
    ): void;
    /** Enables or disables Windows power throttling for the process. */
    function setEcoMode(pid: number | { pid: number }, enabled: boolean): void;
    /** Asks Windows to trim the process working set. */
    function trimWorkingSet(pid: number | { pid: number }): void;
  }

  interface JobLimits {
    /** Terminate every process of the job when the last handle to the job closes. */
    killOnClose?: boolean;
    /** Committed memory limit per process, in bytes. */
    processMemory?: number;
    /** Committed memory limit for the whole job, in bytes. */
    jobMemory?: number;
    /** Maximum number of simultaneously active processes. */
    activeProcesses?: number;
    /** Hard CPU cap as a percentage of the machine, greater than 0 and at most 100. */
    cpuRate?: number;
  }

  interface JobInfo {
    activeProcesses: number;
    totalProcesses: number;
    terminatedProcesses: number;
    /** User-mode CPU time in milliseconds. */
    userTime: number;
    /** Kernel-mode CPU time in milliseconds. */
    kernelTime: number;
    /** Bytes. */
    peakProcessMemory: number;
    /** Bytes. */
    peakJobMemory: number;
    pids: number[];
  }

  /**
   * A Job Object: a group of processes with shared limits and accounting. Children of an
   * assigned process join the job too.
   *
   * @example
   * ```ts
   * using job = new windows.Job({ killOnClose: true, jobMemory: 512 * 1024 * 1024 });
   * const child = Bun.spawn(["worker.exe"]);
   * job.assign(child);
   * ```
   */
  class Job implements Disposable {
    /** Creates a job, named when `name` is given, and applies the other options as limits. */
    constructor(options?: JobLimits & { name?: string });
    readonly closed: boolean;
    /** Replaces the limits of the job. */
    setLimits(limits: JobLimits): void;
    /** Adds a process to the job. */
    assign(pid: number | { pid: number }): void;
    /** Terminates every process of the job with `exitCode` (default `1`). */
    terminate(exitCode?: number): void;
    info(): JobInfo;
    /** Closes the handle. With `killOnClose`, the processes of the job are terminated. */
    close(): void;
    [Symbol.dispose](): void;
  }

  interface NotificationOptions {
    /**
     * App User Model ID the notification is shown under. It must belong to an installed app
     * with a Start menu shortcut. Defaults to the id of Windows PowerShell.
     */
    appId?: string;
  }

  /** Shows a toast notification with a title and an optional body. */
  function notify(title: string, body?: string, options?: NotificationOptions): void;

  /** Shows a toast notification described by raw toast XML. */
  function toast(xml: string, options?: NotificationOptions): void;

  interface WslDistribution {
    /** Registration GUID. */
    id: string;
    name: string;
    /** Directory holding the virtual disk. */
    basePath: string;
    /** WSL version, `1` or `2`. */
    version: number;
    default: boolean;
  }

  /** Windows Subsystem for Linux. */
  namespace wsl {
    /** Registered distributions of the current user, read from the registry. Empty when WSL has none. */
    function distributions(): WslDistribution[];
    /** Runs `command` in `distribution` through `wsl.exe` and waits for it. */
    function run(
      distribution: string,
      command: string[],
      options?: { cwd?: string; env?: Record<string, string | undefined> },
    ): { exitCode: number | null; stdout: string; stderr: string };
  }

  interface LogicalDrive {
    root: string;
    type: "removable" | "fixed" | "remote" | "optical" | "ramdisk" | "unknown";
    totalBytes: number;
    freeBytes: number;
    availableBytes: number;
  }

  /** Logical drives visible to the process, with total and available capacity. */
  namespace storage {
    function drives(): LogicalDrive[];
  }

  interface WindowsMemoryStatus {
    memoryLoad: number;
    totalPhysical: number;
    availablePhysical: number;
    totalPageFile: number;
    availablePageFile: number;
    totalVirtual: number;
    availableVirtual: number;
  }

  /** Physical, page-file and virtual memory counters from `GlobalMemoryStatusEx`. */
  namespace memory {
    function status(): WindowsMemoryStatus;
  }

  /** `true` on Windows. */
  const isSupported: boolean;
  /** Windows version, read once and cached. */
  function version(): WindowsVersion;
  /** `true` on Windows 11 (build 22000 or later). `false` on other platforms. */
  function isWindows11(): boolean;
  function systemInfo(): WindowsSystemInfo;
  /** Whether the process runs with an elevated (administrator) token. */
  function isElevated(): boolean;
}
