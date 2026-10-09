/**
 * Native Linux kernel interfaces.
 *
 * Every function is synchronous and throws a `SystemError` (with `code`, `errno`,
 * `syscall` and, where relevant, `path`) when the kernel call fails. On other
 * platforms {@link isSupported} is `false` and every call that reaches the kernel throws.
 *
 * Most of these calls need privileges. Namespace, mount, cgroup, module and power
 * calls usually need root or the matching capability.
 *
 * @example
 * ```ts
 * import linux from "bun:linux";
 *
 * if (linux.isSupported) {
 *   const fd = linux.memfdCreate("scratch");
 * }
 * ```
 *
 * @category Linux
 */
declare module "bun:linux" {
  /** Mapping of `limits` keys accepted by {@link cgroup.create} and {@link cgroup.setLimits}. */
  interface CgroupLimits {
    /**
     * Writes `cpu.max`. A string is written as is: `"max"`, `"<quota>"` or `"<quota> <period>"`
     * in microseconds. A number is a fraction of one CPU over a 100000 microsecond period
     * (`0.5` is half a CPU, `2` is two CPUs).
     */
    cpuMax?: string | number;
    /** Writes `memory.max`, a hard limit in bytes, or `"max"`. */
    memoryMax?: number | "max";
    /** Writes `memory.high`, a throttling threshold in bytes, or `"max"`. */
    memoryHigh?: number | "max";
    /** Writes `pids.max`, the maximum number of processes, or `"max"`. */
    pidsMax?: number | "max";
    /** Writes `cpu.weight`, an integer from 1 to 10000. */
    cpuWeight?: number;
    /** Writes `io.weight`, an integer from 1 to 10000. */
    ioWeight?: number;
  }

  /** Capability sets of a process. Bit `n` is capability `n`, see the `CAP_*` constants. */
  interface CapabilitySets {
    effective: bigint;
    permitted: bigint;
    inheritable: bigint;
  }

  /** Paths granted to the calling thread by {@link landlock.restrictSelf}. */
  interface LandlockRules {
    /** Read files and list directories. */
    readOnly?: string[];
    /** Read, write, create, remove and rename below these paths. Execution stays denied. */
    readWrite?: string[];
    /** Read and execute. */
    execute?: string[];
  }

  /** Result of {@link ioUring.probe}. */
  interface IoUringProbe {
    /** `true` when the kernel lets this process create an io_uring instance. */
    supported: boolean;
    /** Supported `IORING_OP_*` opcodes. Empty when `supported` is `false`. */
    ops: number[];
  }

  /** `true` on Linux. */
  const isSupported: boolean;

  /** Numeric values of the Linux flags, options and capability numbers used by this module. */
  const constants: Readonly<Record<string, number>> & {
    readonly CLONE_NEWTIME: number;
    readonly CLONE_NEWNS: number;
    readonly CLONE_NEWCGROUP: number;
    readonly CLONE_NEWUTS: number;
    readonly CLONE_NEWIPC: number;
    readonly CLONE_NEWUSER: number;
    readonly CLONE_NEWPID: number;
    readonly CLONE_NEWNET: number;
    readonly MS_RDONLY: number;
    readonly MS_NOSUID: number;
    readonly MS_NODEV: number;
    readonly MS_NOEXEC: number;
    readonly MS_REMOUNT: number;
    readonly MS_BIND: number;
    readonly MS_MOVE: number;
    readonly MS_REC: number;
    readonly MS_PRIVATE: number;
    readonly MS_SLAVE: number;
    readonly MS_SHARED: number;
    readonly MS_UNBINDABLE: number;
    readonly MNT_FORCE: number;
    readonly MNT_DETACH: number;
    readonly MNT_EXPIRE: number;
    readonly UMOUNT_NOFOLLOW: number;
    readonly PR_SET_PDEATHSIG: number;
    readonly PR_GET_PDEATHSIG: number;
    readonly PR_SET_NO_NEW_PRIVS: number;
    readonly PR_GET_NO_NEW_PRIVS: number;
    readonly PR_CAP_AMBIENT: number;
    readonly CAP_SYS_ADMIN: number;
    readonly CAP_NET_ADMIN: number;
    readonly CAP_SYS_MODULE: number;
    readonly CAP_SYS_BOOT: number;
    readonly RB_AUTOBOOT: number;
    readonly RB_HALT_SYSTEM: number;
    readonly RB_ENABLE_CAD: number;
    readonly RB_DISABLE_CAD: number;
    readonly RB_POWER_OFF: number;
    readonly RB_SW_SUSPEND: number;
    readonly RB_KEXEC: number;
    readonly LANDLOCK_ACCESS_FS_EXECUTE: number;
    readonly LANDLOCK_ACCESS_FS_READ_FILE: number;
    readonly LANDLOCK_ACCESS_FS_READ_DIR: number;
    readonly MFD_CLOEXEC: number;
    readonly MFD_ALLOW_SEALING: number;
    readonly MFD_HUGETLB: number;
    readonly MFD_NOEXEC_SEAL: number;
    readonly MFD_EXEC: number;
    readonly PIDFD_NONBLOCK: number;
    readonly PIDFD_THREAD: number;
    readonly MODULE_INIT_IGNORE_MODVERSIONS: number;
    readonly MODULE_INIT_IGNORE_VERMAGIC: number;
    readonly MODULE_INIT_COMPRESSED_FILE: number;
    readonly DELETE_MODULE_NONBLOCK: number;
    readonly DELETE_MODULE_FORCE: number;
    readonly KEXEC_FILE_UNLOAD: number;
    readonly KEXEC_FILE_ON_CRASH: number;
    readonly KEXEC_FILE_NO_INITRAMFS: number;
  };

  /**
   * Moves the calling thread into new namespaces (`unshare(2)`).
   *
   * The change applies to the calling thread only. Bun runs JavaScript on the main
   * thread, so spawned children inherit it. `CLONE_NEWPID` affects children, not the caller.
   *
   * Needs `CAP_SYS_ADMIN`, except `CLONE_NEWUSER` which an unprivileged user may use when
   * the kernel allows user namespaces.
   *
   * @param flags Bitwise OR of `CLONE_NEW*` constants.
   * @throws `EPERM` without the required privilege, `EINVAL` for unknown flags.
   */
  function unshare(flags: number): void;

  /**
   * Joins the namespace referred to by a file descriptor (`setns(2)`).
   *
   * @param fd A descriptor for `/proc/<pid>/ns/<name>` or a pidfd.
   * @param nstype A `CLONE_NEW*` constant that the namespace must match, or `0` for any.
   * @throws `EPERM` without `CAP_SYS_ADMIN` in the target namespace, `EINVAL` on a type mismatch.
   */
  function setns(fd: number, nstype?: number): void;

  /**
   * Mounts a filesystem (`mount(2)`).
   *
   * Needs `CAP_SYS_ADMIN` in the mount namespace.
   *
   * @param source Device, directory to bind, or `null`.
   * @param target Mount point.
   * @param fstype Filesystem type such as `"tmpfs"`, or `null` for bind mounts and propagation changes.
   * @param flags Bitwise OR of `MS_*` constants. Defaults to `0`.
   * @param data Filesystem-specific options such as `"size=1m"`.
   * @throws `EPERM`, `ENOENT`, `EBUSY`, `EINVAL` and other errors from `mount(2)`.
   */
  function mount(
    source: string | null,
    target: string,
    fstype: string | null,
    flags?: number,
    data?: string | null,
  ): void;

  /**
   * Unmounts a filesystem (`umount2(2)`).
   *
   * Needs `CAP_SYS_ADMIN`.
   *
   * @param flags Bitwise OR of `MNT_*` and `UMOUNT_NOFOLLOW`. Defaults to `0`.
   * @throws `EPERM`, `EBUSY`, `EINVAL`.
   */
  function umount(target: string, flags?: number): void;

  /**
   * Makes `newRoot` the root of the mount namespace and moves the old root to `putOld`
   * (`pivot_root(2)`).
   *
   * `newRoot` must be a mount point and `putOld` must be at or below it. Needs
   * `CAP_SYS_ADMIN`.
   *
   * @throws `EPERM`, `EINVAL`, `EBUSY`.
   */
  function pivotRoot(newRoot: string, putOld: string): void;

  /**
   * Control groups, version 2 only. Paths are relative to `/sys/fs/cgroup`; an absolute path
   * below that root is accepted. Segments `.` and `..` are rejected before any I/O.
   */
  namespace cgroup {
    /**
     * Creates a cgroup, with missing parents, and applies `limits`.
     *
     * Enables the `cpu`, `memory`, `pids` and `io` controllers in each parent when possible.
     * Needs write access to the cgroup tree, usually root or a delegated subtree.
     *
     * @returns The absolute path of the cgroup.
     * @throws `TypeError` or `RangeError` for invalid arguments, `ENOTSUP` when
     * `/sys/fs/cgroup` is not cgroup2, `EACCES` or `EPERM` without access.
     */
    function create(path: string, limits?: CgroupLimits): string;

    /**
     * Writes limits to an existing cgroup.
     *
     * @throws `TypeError` or `RangeError` for invalid arguments, `ENOENT` if the cgroup does not exist.
     */
    function setLimits(path: string, limits: CgroupLimits): void;

    /**
     * Moves a process into a cgroup by writing `cgroup.procs`.
     *
     * @param pid Defaults to `process.pid`.
     * @throws `EACCES`, `EPERM`, `ESRCH`, `EBUSY`.
     */
    function attach(path: string, pid?: number): void;

    /**
     * Removes an empty cgroup.
     *
     * @throws `EBUSY` while processes or child cgroups remain, `ENOENT` if missing.
     */
    function remove(path: string): void;

    /**
     * Returns the cgroup2 path of a process, such as `"/user.slice"`, or `null` if it has none.
     *
     * @param pid Defaults to `process.pid`.
     * @throws `ENOENT` if the process does not exist. Throws on non-Linux platforms.
     */
    function current(pid?: number): string | null;

    /**
     * Reads a control file of a cgroup, such as `"memory.current"`, and returns its text.
     *
     * @throws `ENOENT` if the file does not exist.
     */
    function read(path: string, file: string): string;
  }

  /** Process capabilities (`capget(2)`, `capset(2)`) and related `prctl(2)` calls. */
  namespace capabilities {
    /**
     * Returns the capability sets of a process.
     *
     * @param pid Defaults to the calling process.
     * @throws `ESRCH` if the process does not exist.
     */
    function get(pid?: number): CapabilitySets;

    /**
     * Replaces the capability sets of the calling thread.
     *
     * The effective set must be a subset of the permitted set, and you cannot add to the
     * permitted set. Dropping is always allowed.
     *
     * @throws `EPERM` when the request raises privileges.
     */
    function set(sets: CapabilitySets): void;

    /**
     * Removes a capability from the bounding set.
     *
     * Needs `CAP_SETPCAP`.
     *
     * @param cap A `CAP_*` constant.
     * @throws `EPERM`, `EINVAL` for an unknown capability.
     */
    function dropBounding(cap: number): void;

    /**
     * Adds a capability to the ambient set, so it survives `execve`.
     *
     * The capability must be in both the permitted and inheritable sets.
     *
     * @param cap A `CAP_*` constant.
     * @throws `EPERM`, `EINVAL`.
     */
    function raiseAmbient(cap: number): void;
  }

  /**
   * Calls `prctl(2)`.
   *
   * `PR_GET_PDEATHSIG` and `PR_GET_CHILD_SUBREAPER` return the value the kernel reports.
   * Other options return the raw result.
   *
   * @param option A `PR_*` value.
   * @param arg2 Second to fifth arguments. They default to `0`. A bigint is truncated to 64 bits.
   * @throws The error `prctl(2)` reports.
   */
  function prctl(
    option: number,
    arg2?: number | bigint,
    arg3?: number | bigint,
    arg4?: number | bigint,
    arg5?: number | bigint,
  ): number;

  /**
   * Sets `PR_SET_NO_NEW_PRIVS`. The process and its children can never gain privileges
   * through `execve`. The setting cannot be undone.
   */
  function setNoNewPrivs(): void;

  /**
   * Opens a pidfd for a process (`pidfd_open(2)`). Close the descriptor with `fs.closeSync`.
   *
   * Needs Linux 5.3 or later.
   *
   * @param flags `PIDFD_NONBLOCK` or `PIDFD_THREAD`. Defaults to `0`.
   * @returns The file descriptor.
   * @throws `ESRCH` if the process does not exist, `ENOSYS` on old kernels.
   */
  function pidfdOpen(pid: number, flags?: number): number;

  /**
   * Sends a signal through a pidfd (`pidfd_send_signal(2)`). Unlike `process.kill`, this
   * cannot hit a reused pid.
   *
   * @param signal A signal number or name such as `"SIGKILL"`.
   * @throws `ESRCH` if the process has exited, `EPERM` without permission.
   */
  function pidfdSendSignal(pidfd: number, signal: number | NodeJS.Signals): void;

  /**
   * Duplicates a file descriptor of another process into this one (`pidfd_getfd(2)`).
   *
   * Needs Linux 5.6 and ptrace access (`PTRACE_MODE_ATTACH_REALCREDS`) to the target.
   *
   * @returns The new file descriptor.
   * @throws `EPERM`, `EBADF`, `ESRCH`.
   */
  function pidfdGetfd(pidfd: number, targetFd: number): number;

  /**
   * Creates an anonymous in-memory file (`memfd_create(2)`) and returns its descriptor.
   * Use `fs.writeSync` and `fs.readSync` on it. Close it with `fs.closeSync`.
   *
   * @param name Debug name shown in `/proc/self/fd`.
   * @param flags `MFD_*` flags. Defaults to `MFD_CLOEXEC`.
   * @throws `EINVAL` for bad flags, `EMFILE` when out of descriptors.
   */
  function memfdCreate(name: string, flags?: number): number;

  /** Landlock filesystem sandboxing. */
  namespace landlock {
    /**
     * Returns the Landlock ABI version of the kernel, or `0` if Landlock is unavailable.
     */
    function abiVersion(): number;

    /**
     * Restricts the calling thread, and the children it later creates, to the listed paths.
     * Sets no-new-privs first. The restriction cannot be lifted.
     *
     * Rights the running kernel does not know are left unhandled. Landlock is per thread, so
     * only the thread that calls this, and processes spawned from it, are confined.
     *
     * @throws `ENOSYS` or `EOPNOTSUPP` when Landlock is disabled, `ENOENT` for a missing path.
     */
    function restrictSelf(rules: LandlockRules): void;
  }

  /** Kernel parameters under `/proc/sys`. */
  namespace sysctl {
    /**
     * Reads a parameter such as `"kernel.ostype"`, without the trailing newline.
     *
     * @throws `TypeError` if the name is not a dotted name of letters, digits, `_` and `-`.
     * `ENOENT` if the parameter does not exist.
     */
    function get(name: string): string;

    /**
     * Writes a parameter such as `"net.ipv4.ip_forward"`.
     *
     * Needs root for most parameters.
     *
     * @throws `TypeError` for an invalid name, `EACCES` or `EPERM`, `EINVAL` for a rejected value.
     */
    function set(name: string, value: string | number): void;
  }

  /**
   * Loads a kernel module from a file (`finit_module(2)`).
   *
   * Needs `CAP_SYS_MODULE`.
   *
   * @param pathOrFd A path, or an open file descriptor.
   * @param params Module parameters, such as `"debug=1"`.
   * @param flags `MODULE_INIT_*` flags. Defaults to `0`.
   * @throws `EPERM`, `ENOENT`, `EEXIST` if already loaded, `ENOEXEC` for a bad image.
   */
  function finitModule(pathOrFd: string | number, params?: string | null, flags?: number): void;

  /**
   * Loads a kernel module from memory (`init_module(2)`).
   *
   * Needs `CAP_SYS_MODULE`.
   *
   * @throws `EPERM`, `EEXIST`, `ENOEXEC`.
   */
  function initModule(image: ArrayBufferView, params?: string | null): void;

  /**
   * Unloads a kernel module (`delete_module(2)`).
   *
   * Needs `CAP_SYS_MODULE`.
   *
   * @param name The module name, such as `"dummy"`.
   * @param flags `DELETE_MODULE_*` flags. Defaults to `0`.
   * @throws `EPERM`, `ENOENT`, `EBUSY`.
   */
  function deleteModule(name: string, flags?: number): void;

  /**
   * Calls `reboot(2)`.
   *
   * `RB_AUTOBOOT`, `RB_HALT_SYSTEM`, `RB_POWER_OFF`, `RB_SW_SUSPEND` and `RB_KEXEC` act at once and do not
   * sync filesystems. The call returns only on error, or for `RB_ENABLE_CAD` and `RB_DISABLE_CAD`.
   *
   * Needs `CAP_SYS_BOOT`.
   *
   * @param cmd One of the `RB_*` constants.
   * @throws `TypeError` for an unknown command, `EPERM` without privilege.
   */
  function reboot(cmd: number): void;

  /**
   * Loads a kernel for a later `reboot(RB_KEXEC)` (`kexec_file_load(2)`).
   *
   * Needs `CAP_SYS_BOOT`.
   *
   * @param kernelFd Open descriptor of the kernel image.
   * @param initrdFd Open descriptor of the initrd, or `null` for none.
   * @param cmdline Kernel command line.
   * @param flags `KEXEC_FILE_*` flags. Defaults to `0`.
   * @throws `EPERM`, `ENOSYS`, `EBADF`, `EINVAL`.
   */
  function kexecFileLoad(kernelFd: number, initrdFd: number | null, cmdline: string, flags?: number): void;

  /**
   * Bun does not use io_uring on Linux. This namespace only reports what the kernel offers.
   */
  namespace ioUring {
    /**
     * Creates and closes a minimal ring to learn whether io_uring works for this process
     * and which opcodes it supports. Never throws on Linux.
     */
    function probe(): IoUringProbe;
  }

  const _default: {
    isSupported: typeof isSupported;
    constants: typeof constants;
    unshare: typeof unshare;
    setns: typeof setns;
    mount: typeof mount;
    umount: typeof umount;
    pivotRoot: typeof pivotRoot;
    cgroup: typeof cgroup;
    capabilities: typeof capabilities;
    prctl: typeof prctl;
    setNoNewPrivs: typeof setNoNewPrivs;
    pidfdOpen: typeof pidfdOpen;
    pidfdSendSignal: typeof pidfdSendSignal;
    pidfdGetfd: typeof pidfdGetfd;
    memfdCreate: typeof memfdCreate;
    landlock: typeof landlock;
    sysctl: typeof sysctl;
    finitModule: typeof finitModule;
    initModule: typeof initModule;
    deleteModule: typeof deleteModule;
    reboot: typeof reboot;
    kexecFileLoad: typeof kexecFileLoad;
    ioUring: typeof ioUring;
  };
  export default _default;
  export {
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
    CgroupLimits,
    CapabilitySets,
    LandlockRules,
    IoUringProbe,
  };
}
