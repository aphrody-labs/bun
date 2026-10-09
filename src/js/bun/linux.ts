// Hardcoded module "bun:linux"
//
// Synchronous bindings to Linux kernel interfaces. The native side lives in
// src/runtime/linux/*.rs; this file validates arguments, converts 64-bit
// values and formats cgroup/sysctl strings. Nothing here runs until the module
// is imported.
const { validateInteger, validateString } = require("internal/validators");

const isSupported = process.platform === "linux";

const MAX_INT32 = 2147483647;
const MAX_UINT32 = 4294967295;

const unshareNative = $newRustFunction("linux/namespaces.rs", "jsUnshare", 1);
const setnsNative = $newRustFunction("linux/namespaces.rs", "jsSetns", 2);
const mountNative = $newRustFunction("linux/mount.rs", "jsMount", 5);
const umountNative = $newRustFunction("linux/mount.rs", "jsUmount", 2);
const pivotRootNative = $newRustFunction("linux/mount.rs", "jsPivotRoot", 2);
const cgroupMkdirNative = $newRustFunction("linux/cgroup.rs", "jsCgroupMkdir", 1);
const cgroupWriteNative = $newRustFunction("linux/cgroup.rs", "jsCgroupWrite", 3);
const cgroupReadNative = $newRustFunction("linux/cgroup.rs", "jsCgroupRead", 2);
const cgroupRmdirNative = $newRustFunction("linux/cgroup.rs", "jsCgroupRmdir", 1);
const capgetNative = $newRustFunction("linux/caps.rs", "jsCapget", 1);
const capsetNative = $newRustFunction("linux/caps.rs", "jsCapset", 6);
const prctlNative = $newRustFunction("linux/caps.rs", "jsPrctl", 9);
const pidfdOpenNative = $newRustFunction("linux/pidfd.rs", "jsPidfdOpen", 2);
const pidfdSendSignalNative = $newRustFunction("linux/pidfd.rs", "jsPidfdSendSignal", 2);
const pidfdGetfdNative = $newRustFunction("linux/pidfd.rs", "jsPidfdGetfd", 2);
const memfdCreateNative = $newRustFunction("linux/memfd.rs", "jsMemfdCreate", 2);
const landlockAbiVersionNative = $newRustFunction("linux/landlock.rs", "jsLandlockAbiVersion", 0);
const landlockRestrictSelfNative = $newRustFunction("linux/landlock.rs", "jsLandlockRestrictSelf", 3);
const sysctlGetNative = $newRustFunction("linux/sysctl.rs", "jsSysctlGet", 1);
const sysctlSetNative = $newRustFunction("linux/sysctl.rs", "jsSysctlSet", 2);
const finitModuleNative = $newRustFunction("linux/kmod.rs", "jsFinitModule", 4);
const initModuleNative = $newRustFunction("linux/kmod.rs", "jsInitModule", 2);
const deleteModuleNative = $newRustFunction("linux/kmod.rs", "jsDeleteModule", 2);
const rebootNative = $newRustFunction("linux/power.rs", "jsReboot", 1);
const kexecFileLoadNative = $newRustFunction("linux/power.rs", "jsKexecFileLoad", 4);
const ioUringProbeNative = $newRustFunction("linux/io_uring.rs", "jsIoUringProbe", 0);
const seccompSetFilterNative = $newRustFunction("linux/seccomp.rs", "jsSeccompSetFilter", 2);
const seccompActionAvailableNative = $newRustFunction("linux/seccomp.rs", "jsSeccompActionAvailable", 1);
const perfEventOpenNative = $newRustFunction("linux/perf_event.rs", "jsPerfEventOpen", 5);
const perfEventIoctlNative = $newRustFunction("linux/perf_event.rs", "jsPerfEventIoctl", 3);
const bpfMapCreateNative = $newRustFunction("linux/bpf.rs", "jsBpfMapCreate", 6);
const bpfMapElemNative = $newRustFunction("linux/bpf.rs", "jsBpfMapElem", 5);
const bpfProgLoadNative = $newRustFunction("linux/bpf.rs", "jsBpfProgLoad", 6);
const bpfObjPinNative = $newRustFunction("linux/bpf.rs", "jsBpfObjPin", 2);
const bpfObjGetNative = $newRustFunction("linux/bpf.rs", "jsBpfObjGet", 2);
const netlinkRequestNative = $newRustFunction("linux/netlink.rs", "jsNetlinkRequest", 2);

const constants = Object.freeze({
  CLONE_NEWTIME: 0x00000080,
  CLONE_NEWNS: 0x00020000,
  CLONE_NEWCGROUP: 0x02000000,
  CLONE_NEWUTS: 0x04000000,
  CLONE_NEWIPC: 0x08000000,
  CLONE_NEWUSER: 0x10000000,
  CLONE_NEWPID: 0x20000000,
  CLONE_NEWNET: 0x40000000,

  MS_RDONLY: 1,
  MS_NOSUID: 2,
  MS_NODEV: 4,
  MS_NOEXEC: 8,
  MS_SYNCHRONOUS: 16,
  MS_REMOUNT: 32,
  MS_DIRSYNC: 128,
  MS_NOSYMFOLLOW: 256,
  MS_NOATIME: 1024,
  MS_NODIRATIME: 2048,
  MS_BIND: 4096,
  MS_MOVE: 8192,
  MS_REC: 16384,
  MS_SILENT: 32768,
  MS_UNBINDABLE: 1 << 17,
  MS_PRIVATE: 1 << 18,
  MS_SLAVE: 1 << 19,
  MS_SHARED: 1 << 20,
  MS_RELATIME: 1 << 21,
  MS_STRICTATIME: 1 << 24,
  MS_LAZYTIME: 1 << 25,

  MNT_FORCE: 1,
  MNT_DETACH: 2,
  MNT_EXPIRE: 4,
  UMOUNT_NOFOLLOW: 8,

  PR_SET_PDEATHSIG: 1,
  PR_GET_PDEATHSIG: 2,
  PR_GET_DUMPABLE: 3,
  PR_SET_DUMPABLE: 4,
  PR_GET_KEEPCAPS: 7,
  PR_SET_KEEPCAPS: 8,
  PR_CAPBSET_READ: 23,
  PR_CAPBSET_DROP: 24,
  PR_GET_SECUREBITS: 27,
  PR_SET_SECUREBITS: 28,
  PR_SET_TIMERSLACK: 29,
  PR_GET_TIMERSLACK: 30,
  PR_SET_CHILD_SUBREAPER: 36,
  PR_GET_CHILD_SUBREAPER: 37,
  PR_SET_NO_NEW_PRIVS: 38,
  PR_GET_NO_NEW_PRIVS: 39,
  PR_CAP_AMBIENT: 47,
  PR_CAP_AMBIENT_IS_SET: 1,
  PR_CAP_AMBIENT_RAISE: 2,
  PR_CAP_AMBIENT_LOWER: 3,
  PR_CAP_AMBIENT_CLEAR_ALL: 4,

  CAP_CHOWN: 0,
  CAP_DAC_OVERRIDE: 1,
  CAP_DAC_READ_SEARCH: 2,
  CAP_FOWNER: 3,
  CAP_FSETID: 4,
  CAP_KILL: 5,
  CAP_SETGID: 6,
  CAP_SETUID: 7,
  CAP_SETPCAP: 8,
  CAP_LINUX_IMMUTABLE: 9,
  CAP_NET_BIND_SERVICE: 10,
  CAP_NET_BROADCAST: 11,
  CAP_NET_ADMIN: 12,
  CAP_NET_RAW: 13,
  CAP_IPC_LOCK: 14,
  CAP_IPC_OWNER: 15,
  CAP_SYS_MODULE: 16,
  CAP_SYS_RAWIO: 17,
  CAP_SYS_CHROOT: 18,
  CAP_SYS_PTRACE: 19,
  CAP_SYS_PACCT: 20,
  CAP_SYS_ADMIN: 21,
  CAP_SYS_BOOT: 22,
  CAP_SYS_NICE: 23,
  CAP_SYS_RESOURCE: 24,
  CAP_SYS_TIME: 25,
  CAP_SYS_TTY_CONFIG: 26,
  CAP_MKNOD: 27,
  CAP_LEASE: 28,
  CAP_AUDIT_WRITE: 29,
  CAP_AUDIT_CONTROL: 30,
  CAP_SETFCAP: 31,
  CAP_MAC_OVERRIDE: 32,
  CAP_MAC_ADMIN: 33,
  CAP_SYSLOG: 34,
  CAP_WAKE_ALARM: 35,
  CAP_BLOCK_SUSPEND: 36,
  CAP_AUDIT_READ: 37,
  CAP_PERFMON: 38,
  CAP_BPF: 39,
  CAP_CHECKPOINT_RESTORE: 40,

  RB_AUTOBOOT: 0x01234567,
  RB_HALT_SYSTEM: 0xcdef0123,
  RB_ENABLE_CAD: 0x89abcdef,
  RB_DISABLE_CAD: 0,
  RB_POWER_OFF: 0x4321fedc,
  RB_SW_SUSPEND: 0xd000fce2,
  RB_KEXEC: 0x45584543,

  LANDLOCK_ACCESS_FS_EXECUTE: 1 << 0,
  LANDLOCK_ACCESS_FS_WRITE_FILE: 1 << 1,
  LANDLOCK_ACCESS_FS_READ_FILE: 1 << 2,
  LANDLOCK_ACCESS_FS_READ_DIR: 1 << 3,
  LANDLOCK_ACCESS_FS_REMOVE_DIR: 1 << 4,
  LANDLOCK_ACCESS_FS_REMOVE_FILE: 1 << 5,
  LANDLOCK_ACCESS_FS_MAKE_CHAR: 1 << 6,
  LANDLOCK_ACCESS_FS_MAKE_DIR: 1 << 7,
  LANDLOCK_ACCESS_FS_MAKE_REG: 1 << 8,
  LANDLOCK_ACCESS_FS_MAKE_SOCK: 1 << 9,
  LANDLOCK_ACCESS_FS_MAKE_FIFO: 1 << 10,
  LANDLOCK_ACCESS_FS_MAKE_BLOCK: 1 << 11,
  LANDLOCK_ACCESS_FS_MAKE_SYM: 1 << 12,
  LANDLOCK_ACCESS_FS_REFER: 1 << 13,
  LANDLOCK_ACCESS_FS_TRUNCATE: 1 << 14,
  LANDLOCK_ACCESS_FS_IOCTL_DEV: 1 << 15,

  MFD_CLOEXEC: 0x0001,
  MFD_ALLOW_SEALING: 0x0002,
  MFD_HUGETLB: 0x0004,
  MFD_NOEXEC_SEAL: 0x0008,
  MFD_EXEC: 0x0010,

  PIDFD_NONBLOCK: 0o4000,
  PIDFD_THREAD: 0o200,

  MODULE_INIT_IGNORE_MODVERSIONS: 1,
  MODULE_INIT_IGNORE_VERMAGIC: 2,
  MODULE_INIT_COMPRESSED_FILE: 4,
  DELETE_MODULE_NONBLOCK: 0o4000,
  DELETE_MODULE_FORCE: 0o1000,

  KEXEC_FILE_UNLOAD: 1,
  KEXEC_FILE_ON_CRASH: 2,
  KEXEC_FILE_NO_INITRAMFS: 4,

  SECCOMP_RET_KILL_PROCESS: 0x80000000,
  SECCOMP_RET_KILL_THREAD: 0,
  SECCOMP_RET_TRAP: 0x00030000,
  SECCOMP_RET_ERRNO: 0x00050000,
  SECCOMP_RET_USER_NOTIF: 0x7fc00000,
  SECCOMP_RET_TRACE: 0x7ff00000,
  SECCOMP_RET_LOG: 0x7ffc0000,
  SECCOMP_RET_ALLOW: 0x7fff0000,
  SECCOMP_FILTER_FLAG_TSYNC: 1,
  SECCOMP_FILTER_FLAG_LOG: 2,
  SECCOMP_FILTER_FLAG_SPEC_ALLOW: 4,
  SECCOMP_FILTER_FLAG_NEW_LISTENER: 8,
  SECCOMP_FILTER_FLAG_TSYNC_ESRCH: 16,
  SECCOMP_FILTER_FLAG_WAIT_KILLABLE_RECV: 32,
  AUDIT_ARCH_X86_64: 0xc000003e,
  AUDIT_ARCH_AARCH64: 0xc00000b7,

  PERF_TYPE_HARDWARE: 0,
  PERF_TYPE_SOFTWARE: 1,
  PERF_TYPE_TRACEPOINT: 2,
  PERF_TYPE_HW_CACHE: 3,
  PERF_TYPE_RAW: 4,
  PERF_TYPE_BREAKPOINT: 5,
  PERF_COUNT_HW_CPU_CYCLES: 0,
  PERF_COUNT_HW_INSTRUCTIONS: 1,
  PERF_COUNT_HW_CACHE_REFERENCES: 2,
  PERF_COUNT_HW_CACHE_MISSES: 3,
  PERF_COUNT_HW_BRANCH_INSTRUCTIONS: 4,
  PERF_COUNT_HW_BRANCH_MISSES: 5,
  PERF_COUNT_SW_CPU_CLOCK: 0,
  PERF_COUNT_SW_TASK_CLOCK: 1,
  PERF_COUNT_SW_PAGE_FAULTS: 2,
  PERF_COUNT_SW_CONTEXT_SWITCHES: 3,
  PERF_COUNT_SW_CPU_MIGRATIONS: 4,
  PERF_EVENT_IOC_ENABLE: 0x2400,
  PERF_EVENT_IOC_DISABLE: 0x2401,
  PERF_EVENT_IOC_REFRESH: 0x2402,
  PERF_EVENT_IOC_RESET: 0x2403,
  PERF_EVENT_IOC_SET_OUTPUT: 0x2405,
  PERF_FLAG_FD_NO_GROUP: 1,
  PERF_FLAG_FD_OUTPUT: 2,
  PERF_FLAG_PID_CGROUP: 4,

  BPF_MAP_TYPE_HASH: 1,
  BPF_MAP_TYPE_ARRAY: 2,
  BPF_MAP_TYPE_PROG_ARRAY: 3,
  BPF_MAP_TYPE_PERF_EVENT_ARRAY: 4,
  BPF_MAP_TYPE_LRU_HASH: 9,
  BPF_MAP_TYPE_LPM_TRIE: 11,
  BPF_MAP_TYPE_QUEUE: 22,
  BPF_MAP_TYPE_STACK: 23,
  BPF_MAP_TYPE_RINGBUF: 27,
  BPF_PROG_TYPE_SOCKET_FILTER: 1,
  BPF_PROG_TYPE_KPROBE: 2,
  BPF_PROG_TYPE_SCHED_CLS: 3,
  BPF_PROG_TYPE_TRACEPOINT: 5,
  BPF_PROG_TYPE_XDP: 6,
  BPF_PROG_TYPE_PERF_EVENT: 7,
  BPF_PROG_TYPE_CGROUP_SKB: 8,
  BPF_PROG_TYPE_CGROUP_SOCK: 9,
  BPF_PROG_TYPE_CGROUP_DEVICE: 15,
  BPF_PROG_TYPE_CGROUP_SYSCTL: 23,
  BPF_ANY: 0,
  BPF_NOEXIST: 1,
  BPF_EXIST: 2,
  BPF_F_LOCK: 4,
  BPF_F_RDONLY: 1 << 3,
  BPF_F_WRONLY: 1 << 4,

  NETLINK_ROUTE: 0,
  NETLINK_SOCK_DIAG: 4,
  NETLINK_AUDIT: 9,
  NETLINK_KOBJECT_UEVENT: 15,
  NETLINK_GENERIC: 16,
  NLM_F_REQUEST: 1,
  NLM_F_MULTI: 2,
  NLM_F_ACK: 4,
  NLM_F_ROOT: 0x100,
  NLM_F_MATCH: 0x200,
  NLM_F_DUMP: 0x300,
  NLMSG_NOOP: 1,
  NLMSG_ERROR: 2,
  NLMSG_DONE: 3,
  RTM_NEWLINK: 16,
  RTM_GETLINK: 18,
  RTM_NEWADDR: 20,
  RTM_GETADDR: 22,
  RTM_NEWROUTE: 24,
  RTM_GETROUTE: 26,
});

function unsupportedError() {
  const error = new Error("bun:linux is only available on Linux");
  error.code = "ERR_BUN_LINUX_UNSUPPORTED";
  return error;
}

function validateFd(value, name) {
  validateInteger(value, name, 0, MAX_INT32);
}

function validateOptionalString(value, name) {
  if (value !== undefined && value !== null) validateString(value, name);
}

function validateObjectArg(value, name) {
  if (typeof value !== "object" || value === null) {
    throw $ERR_INVALID_ARG_TYPE(name, "object", value);
  }
}

/** Convert a number or bigint to an unsigned 64-bit bigint. */
function toUint64(value, name) {
  let big;
  if (typeof value === "bigint") {
    big = value;
  } else if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw $ERR_OUT_OF_RANGE(name, "an integer", value);
    }
    big = BigInt(value);
  } else {
    throw $ERR_INVALID_ARG_TYPE(name, ["number", "bigint"], value);
  }
  return BigInt.asUintN(64, big);
}

function lowWord(big) {
  return Number(big & 0xffffffffn);
}

function highWord(big) {
  return Number(big >> 32n);
}

function joinWords(high, low) {
  return (BigInt(high) << 32n) | BigInt(low);
}

// namespaces

function unshare(flags) {
  validateInteger(flags, "flags", 0, MAX_UINT32);
  unshareNative(flags);
}

function setns(fd, nstype = 0) {
  validateFd(fd, "fd");
  validateInteger(nstype, "nstype", 0, MAX_UINT32);
  setnsNative(fd, nstype);
}

// mount

function mount(source, target, fstype, flags = 0, data) {
  validateOptionalString(source, "source");
  validateString(target, "target");
  validateOptionalString(fstype, "fstype");
  validateInteger(flags, "flags", 0, MAX_UINT32);
  validateOptionalString(data, "data");
  mountNative(source, target, fstype, flags, data);
}

function umount(target, flags = 0) {
  validateString(target, "target");
  validateInteger(flags, "flags", 0, MAX_UINT32);
  umountNative(target, flags);
}

function pivotRoot(newRoot, putOld) {
  validateString(newRoot, "newRoot");
  validateString(putOld, "putOld");
  pivotRootNative(newRoot, putOld);
}

// cgroups v2

const CGROUP_ROOT = "/sys/fs/cgroup";
const CGROUP_PERIOD_US = 100000;

/** Normalize to a path relative to the cgroup2 root, without leading or trailing slashes. */
function cgroupPath(path, name, allowRoot) {
  validateString(path, name);
  if (path === CGROUP_ROOT || path.startsWith(CGROUP_ROOT + "/")) {
    path = path.slice(CGROUP_ROOT.length);
  }
  const segments = [];
  for (const segment of path.split("/")) {
    if (segment === "") continue;
    if (segment === "." || segment === "..") {
      throw $ERR_INVALID_ARG_VALUE(name, path, "must not contain '.' or '..' segments");
    }
    segments.push(segment);
  }
  if (segments.length === 0 && !allowRoot) {
    throw $ERR_INVALID_ARG_VALUE(name, path, "must name a cgroup below the root");
  }
  return segments.join("/");
}

function cgroupLimit(value, name) {
  if (value === "max") return "max";
  if (typeof value !== "number") {
    throw $ERR_INVALID_ARG_TYPE(name, ["number", '"max"'], value);
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw $ERR_OUT_OF_RANGE(name, "a non-negative safe integer or 'max'", value);
  }
  return String(value);
}

function cgroupWeight(value, name) {
  validateInteger(value, name, 1, 10000);
  return String(value);
}

function cgroupCpuMax(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      throw $ERR_OUT_OF_RANGE("limits.cpuMax", "a finite number greater than 0", value);
    }
    const quota = Math.max(1, Math.round(value * CGROUP_PERIOD_US));
    return `${quota} ${CGROUP_PERIOD_US}`;
  }
  if (typeof value === "string") {
    if (!/^(?:max|[0-9]+)(?: [0-9]+)?$/.test(value)) {
      throw $ERR_INVALID_ARG_VALUE("limits.cpuMax", value, "must look like 'max', '<quota>' or '<quota> <period>'");
    }
    return value;
  }
  throw $ERR_INVALID_ARG_TYPE("limits.cpuMax", ["string", "number"], value);
}

const cgroupLimitKeys = ["cpuMax", "memoryMax", "memoryHigh", "pidsMax", "cpuWeight", "ioWeight"];

/** Validate `limits` and return the `[file, value]` writes it stands for. */
function cgroupWrites(limits) {
  const writes = [];
  if (limits === undefined) return writes;
  validateObjectArg(limits, "limits");
  for (const key of Object.keys(limits)) {
    if (!cgroupLimitKeys.includes(key)) {
      throw $ERR_INVALID_ARG_VALUE("limits", key, `has unknown limit '${key}'`);
    }
  }
  if (limits.cpuMax !== undefined) writes.push(["cpu.max", cgroupCpuMax(limits.cpuMax)]);
  if (limits.memoryMax !== undefined) writes.push(["memory.max", cgroupLimit(limits.memoryMax, "limits.memoryMax")]);
  if (limits.memoryHigh !== undefined) {
    writes.push(["memory.high", cgroupLimit(limits.memoryHigh, "limits.memoryHigh")]);
  }
  if (limits.pidsMax !== undefined) writes.push(["pids.max", cgroupLimit(limits.pidsMax, "limits.pidsMax")]);
  if (limits.cpuWeight !== undefined) writes.push(["cpu.weight", cgroupWeight(limits.cpuWeight, "limits.cpuWeight")]);
  if (limits.ioWeight !== undefined) writes.push(["io.weight", cgroupWeight(limits.ioWeight, "limits.ioWeight")]);
  return writes;
}

function cgroupAbsolute(relative) {
  return relative === "" ? CGROUP_ROOT : `${CGROUP_ROOT}/${relative}`;
}

function cgroupCreate(path, limits) {
  const relative = cgroupPath(path, "path", false);
  const writes = cgroupWrites(limits);
  cgroupMkdirNative(relative);
  for (let i = 0; i < writes.length; i++) {
    cgroupWriteNative(relative, writes[i][0], writes[i][1]);
  }
  return cgroupAbsolute(relative);
}

function cgroupSetLimits(path, limits) {
  const relative = cgroupPath(path, "path", false);
  validateObjectArg(limits, "limits");
  const writes = cgroupWrites(limits);
  for (let i = 0; i < writes.length; i++) {
    cgroupWriteNative(relative, writes[i][0], writes[i][1]);
  }
}

function cgroupAttach(path, pid = process.pid) {
  const relative = cgroupPath(path, "path", true);
  validateInteger(pid, "pid", 0, MAX_INT32);
  cgroupWriteNative(relative, "cgroup.procs", String(pid));
}

function cgroupRemove(path) {
  cgroupRmdirNative(cgroupPath(path, "path", false));
}

function cgroupCurrent(pid = process.pid) {
  validateInteger(pid, "pid", 1, MAX_INT32);
  if (!isSupported) throw unsupportedError();
  const text = require("node:fs").readFileSync(`/proc/${pid}/cgroup`, "utf8");
  for (const line of text.split("\n")) {
    if (line.startsWith("0::")) return line.slice(3);
  }
  return null;
}

function cgroupRead(path, file) {
  const relative = cgroupPath(path, "path", true);
  validateString(file, "file");
  return cgroupReadNative(relative, file);
}

const cgroup = {
  create: cgroupCreate,
  setLimits: cgroupSetLimits,
  attach: cgroupAttach,
  remove: cgroupRemove,
  current: cgroupCurrent,
  read: cgroupRead,
};

// capabilities and prctl

function prctl(option, arg2 = 0, arg3 = 0, arg4 = 0, arg5 = 0) {
  validateInteger(option, "option", 0, MAX_INT32);
  const a2 = toUint64(arg2, "arg2");
  const a3 = toUint64(arg3, "arg3");
  const a4 = toUint64(arg4, "arg4");
  const a5 = toUint64(arg5, "arg5");
  return prctlNative(
    option,
    lowWord(a2),
    highWord(a2),
    lowWord(a3),
    highWord(a3),
    lowWord(a4),
    highWord(a4),
    lowWord(a5),
    highWord(a5),
  );
}

function setNoNewPrivs() {
  prctl(constants.PR_SET_NO_NEW_PRIVS, 1);
}

function capabilitiesGet(pid = 0) {
  validateInteger(pid, "pid", 0, MAX_INT32);
  const words = capgetNative(pid);
  return {
    effective: joinWords(words[1], words[0]),
    permitted: joinWords(words[3], words[2]),
    inheritable: joinWords(words[5], words[4]),
  };
}

function capabilitiesSet(sets) {
  validateObjectArg(sets, "sets");
  const effective = toUint64(sets.effective, "sets.effective");
  const permitted = toUint64(sets.permitted, "sets.permitted");
  const inheritable = toUint64(sets.inheritable, "sets.inheritable");
  capsetNative(
    lowWord(effective),
    highWord(effective),
    lowWord(permitted),
    highWord(permitted),
    lowWord(inheritable),
    highWord(inheritable),
  );
}

function capabilitiesDropBounding(cap) {
  validateInteger(cap, "cap", 0, 63);
  prctl(constants.PR_CAPBSET_DROP, cap);
}

function capabilitiesRaiseAmbient(cap) {
  validateInteger(cap, "cap", 0, 63);
  prctl(constants.PR_CAP_AMBIENT, constants.PR_CAP_AMBIENT_RAISE, cap);
}

const capabilities = {
  get: capabilitiesGet,
  set: capabilitiesSet,
  dropBounding: capabilitiesDropBounding,
  raiseAmbient: capabilitiesRaiseAmbient,
};

// pidfd

function pidfdOpen(pid, flags = 0) {
  validateInteger(pid, "pid", 1, MAX_INT32);
  validateInteger(flags, "flags", 0, MAX_UINT32);
  return pidfdOpenNative(pid, flags);
}

function signalNumber(signal) {
  if (typeof signal === "string") {
    const number = require("node:os").constants.signals[signal];
    if (number === undefined) {
      throw $ERR_INVALID_ARG_VALUE("signal", signal, "is not a known signal name");
    }
    return number;
  }
  validateInteger(signal, "signal", 0, 64);
  return signal;
}

function pidfdSendSignal(pidfd, signal) {
  validateFd(pidfd, "pidfd");
  pidfdSendSignalNative(pidfd, signalNumber(signal));
}

function pidfdGetfd(pidfd, targetFd) {
  validateFd(pidfd, "pidfd");
  validateFd(targetFd, "targetFd");
  return pidfdGetfdNative(pidfd, targetFd);
}

// memfd

function memfdCreate(name, flags = constants.MFD_CLOEXEC) {
  validateString(name, "name");
  validateInteger(flags, "flags", 0, MAX_UINT32);
  return memfdCreateNative(name, flags);
}

// landlock

function validatePathList(list, name) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) throw $ERR_INVALID_ARG_TYPE(name, "Array", list);
  for (let i = 0; i < list.length; i++) validateString(list[i], `${name}[${i}]`);
  return list;
}

function landlockAbiVersion() {
  return landlockAbiVersionNative();
}

function landlockRestrictSelf(rules) {
  validateObjectArg(rules, "rules");
  const readOnly = validatePathList(rules.readOnly, "rules.readOnly");
  const readWrite = validatePathList(rules.readWrite, "rules.readWrite");
  const execute = validatePathList(rules.execute, "rules.execute");
  landlockRestrictSelfNative(readOnly, readWrite, execute);
}

const landlock = {
  abiVersion: landlockAbiVersion,
  restrictSelf: landlockRestrictSelf,
};

// sysctl

const sysctlNameRegExp = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

function sysctlName(name) {
  validateString(name, "name");
  if (!sysctlNameRegExp.test(name)) {
    throw $ERR_INVALID_ARG_VALUE("name", name, "must be a dotted sysctl name such as 'net.ipv4.ip_forward'");
  }
  return name;
}

function sysctlGet(name) {
  return sysctlGetNative(sysctlName(name));
}

function sysctlSet(name, value) {
  sysctlName(name);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw $ERR_OUT_OF_RANGE("value", "a finite number", value);
    value = String(value);
  } else if (typeof value !== "string") {
    throw $ERR_INVALID_ARG_TYPE("value", ["string", "number"], value);
  }
  sysctlSetNative(name, value);
}

const sysctl = { get: sysctlGet, set: sysctlSet };

// kernel modules

function finitModule(pathOrFd, params, flags = 0) {
  validateOptionalString(params, "params");
  validateInteger(flags, "flags", 0, MAX_UINT32);
  if (typeof pathOrFd === "string") {
    finitModuleNative(pathOrFd, -1, params, flags);
  } else if (typeof pathOrFd === "number") {
    validateFd(pathOrFd, "pathOrFd");
    finitModuleNative(null, pathOrFd, params, flags);
  } else {
    throw $ERR_INVALID_ARG_TYPE("pathOrFd", ["string", "number"], pathOrFd);
  }
}

function initModule(image, params) {
  if (!ArrayBuffer.isView(image)) {
    throw $ERR_INVALID_ARG_TYPE("image", "ArrayBufferView", image);
  }
  validateOptionalString(params, "params");
  initModuleNative(image, params);
}

function deleteModule(name, flags = 0) {
  validateString(name, "name");
  validateInteger(flags, "flags", 0, MAX_UINT32);
  deleteModuleNative(name, flags);
}

// power

const rebootCommands = [
  constants.RB_AUTOBOOT,
  constants.RB_HALT_SYSTEM,
  constants.RB_ENABLE_CAD,
  constants.RB_DISABLE_CAD,
  constants.RB_POWER_OFF,
  constants.RB_SW_SUSPEND,
  constants.RB_KEXEC,
];

function reboot(cmd) {
  validateInteger(cmd, "cmd", 0, MAX_UINT32);
  if (!rebootCommands.includes(cmd)) {
    throw $ERR_INVALID_ARG_VALUE("cmd", cmd, "must be one of the RB_* constants");
  }
  rebootNative(cmd);
}

function kexecFileLoad(kernelFd, initrdFd, cmdline, flags = 0) {
  validateFd(kernelFd, "kernelFd");
  if (initrdFd === null) {
    initrdFd = -1;
  } else {
    validateFd(initrdFd, "initrdFd");
  }
  validateString(cmdline, "cmdline");
  validateInteger(flags, "flags", 0, MAX_UINT32);
  kexecFileLoadNative(kernelFd, initrdFd, cmdline, flags);
}

// io_uring

function ioUringProbe() {
  const ops = ioUringProbeNative();
  return ops === null ? { supported: false, ops: [] } : { supported: true, ops };
}

const ioUring = { probe: ioUringProbe };

function validateBytes(value, name) {
  if (!ArrayBuffer.isView(value)) {
    throw $ERR_INVALID_ARG_TYPE(name, ["Buffer", "TypedArray", "DataView"], value);
  }
}

// seccomp

const SECCOMP_DATA_NR = 0;
const SECCOMP_DATA_ARCH = 4;
const BPF_LD_W_ABS = 0x20;
const BPF_JMP_JEQ_K = 0x15;
const BPF_JMP_JGE_K = 0x35;
const BPF_RET_K = 0x06;
const X32_SYSCALL_BIT = 0x40000000;

function auditArch() {
  switch (process.arch) {
    case "x64":
      return constants.AUDIT_ARCH_X86_64;
    case "arm64":
      return constants.AUDIT_ARCH_AARCH64;
    default:
      return null;
  }
}

function sockFilter(view, index, code, jt, jf, k) {
  const offset = index * 8;
  view.setUint16(offset, code, true);
  view.setUint8(offset + 2, jt);
  view.setUint8(offset + 3, jf);
  view.setUint32(offset + 4, k >>> 0, true);
}

/**
 * Assemble a classic BPF deny-list: each syscall in `deny` returns
 * `SECCOMP_RET_ERRNO | errno` (or `action`), a foreign architecture (and the
 * x32 ABI on x86_64) gets `mismatch`, everything else is allowed.
 */
function seccompFilter(options) {
  validateObjectArg(options, "options");
  const { deny, errno = 1, action, mismatch = constants.SECCOMP_RET_KILL_PROCESS } = options;
  if (!$isJSArray(deny)) throw $ERR_INVALID_ARG_TYPE("options.deny", "Array", deny);
  if (deny.length > 4000) throw $ERR_OUT_OF_RANGE("options.deny.length", "<= 4000", deny.length);
  for (let i = 0; i < deny.length; i++) validateInteger(deny[i], `options.deny[${i}]`, 0, MAX_INT32);
  validateInteger(errno, "options.errno", 0, 0xffff);
  if (action !== undefined) validateInteger(action, "options.action", 0, MAX_UINT32);
  validateInteger(mismatch, "options.mismatch", 0, MAX_UINT32);
  const arch = auditArch();
  if (arch === null) throw $ERR_INVALID_ARG_VALUE("process.arch", process.arch, "has no seccomp filter support");
  const denied = action === undefined ? (constants.SECCOMP_RET_ERRNO | errno) >>> 0 : action;
  const x32 = arch === constants.AUDIT_ARCH_X86_64;

  const count = 5 + (x32 ? 2 : 0) + deny.length * 2;
  const program = new Uint8Array(count * 8);
  const view = new DataView(program.buffer);
  let i = 0;
  sockFilter(view, i++, BPF_LD_W_ABS, 0, 0, SECCOMP_DATA_ARCH);
  sockFilter(view, i++, BPF_JMP_JEQ_K, 1, 0, arch);
  sockFilter(view, i++, BPF_RET_K, 0, 0, mismatch);
  sockFilter(view, i++, BPF_LD_W_ABS, 0, 0, SECCOMP_DATA_NR);
  if (x32) {
    sockFilter(view, i++, BPF_JMP_JGE_K, 0, 1, X32_SYSCALL_BIT);
    sockFilter(view, i++, BPF_RET_K, 0, 0, mismatch);
  }
  for (const nr of deny) {
    sockFilter(view, i++, BPF_JMP_JEQ_K, 0, 1, nr);
    sockFilter(view, i++, BPF_RET_K, 0, 0, denied);
  }
  sockFilter(view, i++, BPF_RET_K, 0, 0, constants.SECCOMP_RET_ALLOW);
  return program.subarray(0, i * 8);
}

function seccompSetFilter(program, flags = 0) {
  validateBytes(program, "program");
  validateInteger(flags, "flags", 0, MAX_UINT32);
  return seccompSetFilterNative(program, flags);
}

function seccompActionAvailable(action) {
  validateInteger(action, "action", 0, MAX_UINT32);
  return seccompActionAvailableNative(action);
}

const seccomp = {
  filter: seccompFilter,
  setFilter: seccompSetFilter,
  actionAvailable: seccompActionAvailable,
};

// perf_event

const PERF_ATTR_SIZE = 128;
const perfAttrBits = [
  "disabled",
  "inherit",
  "pinned",
  "exclusive",
  "excludeUser",
  "excludeKernel",
  "excludeHv",
  "excludeIdle",
];

function perfEventOpen(options) {
  validateObjectArg(options, "options");
  const { type, config = 0, samplePeriod = 0, sampleType = 0, readFormat = 0 } = options;
  const { pid = 0, cpu = -1, groupFd = -1, flags = 0 } = options;
  validateInteger(type, "options.type", 0, MAX_UINT32);
  validateInteger(pid, "options.pid", -1, MAX_INT32);
  validateInteger(cpu, "options.cpu", -1, MAX_INT32);
  validateInteger(groupFd, "options.groupFd", -1, MAX_INT32);
  validateInteger(flags, "options.flags", 0, MAX_UINT32);
  if (pid === -1 && cpu === -1) {
    throw $ERR_INVALID_ARG_VALUE("options.cpu", cpu, "must name a CPU when pid is -1");
  }
  const attr = new Uint8Array(PERF_ATTR_SIZE);
  const view = new DataView(attr.buffer);
  view.setUint32(0, type, true);
  view.setUint32(4, PERF_ATTR_SIZE, true);
  view.setBigUint64(8, toUint64(config, "options.config"), true);
  view.setBigUint64(16, toUint64(samplePeriod, "options.samplePeriod"), true);
  view.setBigUint64(24, toUint64(sampleType, "options.sampleType"), true);
  view.setBigUint64(32, toUint64(readFormat, "options.readFormat"), true);
  let bits = 0;
  for (let bit = 0; bit < perfAttrBits.length; bit++) {
    const value = options[perfAttrBits[bit]];
    if (value !== undefined && typeof value !== "boolean") {
      throw $ERR_INVALID_ARG_TYPE(`options.${perfAttrBits[bit]}`, "boolean", value);
    }
    if (value) bits |= 1 << bit;
  }
  view.setUint32(40, bits, true);
  return perfEventOpenNative(attr, pid, cpu, groupFd, flags);
}

function perfEventIoctl(fd, request, arg = 0) {
  validateFd(fd, "fd");
  validateInteger(request, "request", 0, MAX_UINT32);
  validateInteger(arg, "arg", 0, MAX_INT32);
  return perfEventIoctlNative(fd, request, arg);
}

/** Read the 64-bit counter of an event opened with the default `readFormat`. */
function perfEventRead(fd) {
  validateFd(fd, "fd");
  const buffer = new Uint8Array(8);
  const n = require("node:fs").readSync(fd, buffer, 0, 8, null);
  if (n !== 8) throw $ERR_INVALID_ARG_VALUE("fd", fd, "did not return a 64-bit counter");
  return new DataView(buffer.buffer).getBigUint64(0, true);
}

const perfEvent = {
  open: perfEventOpen,
  ioctl: perfEventIoctl,
  read: perfEventRead,
};

// bpf

const BPF_LOOKUP = 1;
const BPF_UPDATE = 2;
const BPF_DELETE = 3;
const BPF_NEXT_KEY = 4;

function bpfMapCreate(options) {
  validateObjectArg(options, "options");
  const { type, keySize, valueSize, maxEntries, flags = 0, name } = options;
  validateInteger(type, "options.type", 0, MAX_UINT32);
  validateInteger(keySize, "options.keySize", 0, MAX_UINT32);
  validateInteger(valueSize, "options.valueSize", 0, MAX_UINT32);
  validateInteger(maxEntries, "options.maxEntries", 1, MAX_UINT32);
  validateInteger(flags, "options.flags", 0, MAX_UINT32);
  validateOptionalString(name, "options.name");
  return bpfMapCreateNative(type, keySize, valueSize, maxEntries, flags, name ?? null);
}

function bpfMapLookup(fd, key, value) {
  validateFd(fd, "fd");
  validateBytes(key, "key");
  validateBytes(value, "value");
  return bpfMapElemNative(BPF_LOOKUP, fd, key, value, 0);
}

function bpfMapUpdate(fd, key, value, flags = 0) {
  validateFd(fd, "fd");
  validateBytes(key, "key");
  validateBytes(value, "value");
  validateInteger(flags, "flags", 0, MAX_UINT32);
  bpfMapElemNative(BPF_UPDATE, fd, key, value, flags);
}

function bpfMapDelete(fd, key) {
  validateFd(fd, "fd");
  validateBytes(key, "key");
  return bpfMapElemNative(BPF_DELETE, fd, key, null, 0);
}

function bpfMapNextKey(fd, key, nextKey) {
  validateFd(fd, "fd");
  if (key !== null) validateBytes(key, "key");
  validateBytes(nextKey, "nextKey");
  return bpfMapElemNative(BPF_NEXT_KEY, fd, key, nextKey, 0);
}

function bpfProgLoad(options) {
  validateObjectArg(options, "options");
  const { type, insns, license = "GPL", logSize = 0, expectedAttachType = 0, name } = options;
  validateInteger(type, "options.type", 0, MAX_UINT32);
  validateBytes(insns, "options.insns");
  validateString(license, "options.license");
  validateInteger(logSize, "options.logSize", 0, 16 * 1024 * 1024);
  validateInteger(expectedAttachType, "options.expectedAttachType", 0, MAX_UINT32);
  validateOptionalString(name, "options.name");
  return bpfProgLoadNative(type, insns, license, logSize, expectedAttachType, name ?? null);
}

function bpfPin(fd, path) {
  validateFd(fd, "fd");
  validateString(path, "path");
  bpfObjPinNative(fd, path);
}

function bpfGet(path, flags = 0) {
  validateString(path, "path");
  validateInteger(flags, "flags", 0, MAX_UINT32);
  return bpfObjGetNative(path, flags);
}

const bpf = {
  mapCreate: bpfMapCreate,
  mapLookup: bpfMapLookup,
  mapUpdate: bpfMapUpdate,
  mapDelete: bpfMapDelete,
  mapNextKey: bpfMapNextKey,
  progLoad: bpfProgLoad,
  pin: bpfPin,
  get: bpfGet,
};

// netlink

const NLMSG_HDRLEN = 16;
let netlinkSeq = 0;

/** Encode one `nlmsghdr` message; `seq` defaults to a per-process counter. */
function netlinkEncode(options) {
  validateObjectArg(options, "options");
  const { type, flags = constants.NLM_F_REQUEST, payload } = options;
  let { seq } = options;
  if (seq === undefined) seq = netlinkSeq = (netlinkSeq + 1) >>> 0;
  validateInteger(type, "options.type", 0, 0xffff);
  validateInteger(flags, "options.flags", 0, 0xffff);
  validateInteger(seq, "options.seq", 0, MAX_UINT32);
  let body = new Uint8Array(0);
  if (payload !== undefined) {
    validateBytes(payload, "options.payload");
    body = new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  const length = NLMSG_HDRLEN + body.length;
  const message = new Uint8Array((length + 3) & ~3);
  const view = new DataView(message.buffer);
  view.setUint32(0, length, true);
  view.setUint16(4, type, true);
  view.setUint16(6, flags, true);
  view.setUint32(8, seq, true);
  message.set(body, NLMSG_HDRLEN);
  return message;
}

/** Split a reply buffer into `{ type, flags, seq, pid, payload }` messages. */
function netlinkParse(buffer) {
  validateBytes(buffer, "buffer");
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const messages = [];
  let offset = 0;
  while (offset + NLMSG_HDRLEN <= bytes.length) {
    const length = view.getUint32(offset, true);
    if (length < NLMSG_HDRLEN || offset + length > bytes.length) break;
    messages.push({
      type: view.getUint16(offset + 4, true),
      flags: view.getUint16(offset + 6, true),
      seq: view.getUint32(offset + 8, true),
      pid: view.getUint32(offset + 12, true),
      payload: bytes.subarray(offset + NLMSG_HDRLEN, offset + length),
    });
    offset += (length + 3) & ~3;
  }
  return messages;
}

function netlinkRequest(protocol, message) {
  validateInteger(protocol, "protocol", 0, 31);
  validateBytes(message, "message");
  return netlinkParse(netlinkRequestNative(protocol, message));
}

const netlink = {
  encode: netlinkEncode,
  parse: netlinkParse,
  request: netlinkRequest,
};

export default {
  isSupported,
  constants,
  unshare,
  setns,
  mount,
  umount,
  pivotRoot,
  cgroup,
  capabilities,
  prctl,
  setNoNewPrivs,
  pidfdOpen,
  pidfdSendSignal,
  pidfdGetfd,
  memfdCreate,
  landlock,
  sysctl,
  finitModule,
  initModule,
  deleteModule,
  reboot,
  kexecFileLoad,
  ioUring,
  seccomp,
  perfEvent,
  bpf,
  netlink,
};
