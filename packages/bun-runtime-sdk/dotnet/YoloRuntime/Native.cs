// SPDX-License-Identifier: Apache-2.0
using System.Reflection;
using System.Runtime.InteropServices;

namespace Aphrody.Yolo;

/// <summary>Raw declarations of include/yolo_runtime.h (ABI 1.5).</summary>
internal static unsafe partial class Native
{
    internal const string Library = "yolo_runtime";
    internal const uint AbiMajor = 1;
    internal const uint AbiMinor = 5;

    [StructLayout(LayoutKind.Sequential)]
    internal struct Buffer
    {
        public byte* Data;
        public nuint Len;
        public nuint Cap;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct CreateInfo
    {
        public uint StructSize;
        public uint AbiMajor;
        public uint AbiMinor;
        public uint MaxOperations;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct SpawnInfo
    {
        public uint StructSize;
        public uint Flags;
        public byte* Program;
        public byte** Args;
        public byte** Env;
        public byte* Cwd;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct SpawnInfoV14
    {
        public SpawnInfo Base;
        public ulong CaptureLimit;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct ProcessStatus
    {
        public uint StructSize;
        public uint State;
        public int ExitCode;
        public int Signal;
        public uint Pid;
    }

    [LibraryImport(Library, EntryPoint = "yolo_abi_version")] internal static partial uint AbiVersion();
    [LibraryImport(Library, EntryPoint = "yolo_runtime_create")] internal static partial int RuntimeCreate(CreateInfo* info, ulong* handle);
    [LibraryImport(Library, EntryPoint = "yolo_runtime_destroy")] internal static partial int RuntimeDestroy(ulong runtime);
    [LibraryImport(Library, EntryPoint = "yolo_runtime_build_info")] internal static partial int RuntimeBuildInfo(Buffer* output);
    [LibraryImport(Library, EntryPoint = "yolo_runtime_capabilities")] internal static partial int RuntimeCapabilities(ulong runtime, Buffer* output);
    [LibraryImport(Library, EntryPoint = "yolo_system_stats")] internal static partial int SystemStats(ulong runtime, Buffer* output);
    [LibraryImport(Library, EntryPoint = "yolo_bench_start")] internal static partial int BenchStart(ulong runtime, uint iterations, ulong* operation);
    [LibraryImport(Library, EntryPoint = "yolo_operation_wait")] internal static partial int OperationWait(ulong operation, uint timeoutMs, Buffer* output);
    [LibraryImport(Library, EntryPoint = "yolo_operation_cancel")] internal static partial int OperationCancel(ulong operation);
    [LibraryImport(Library, EntryPoint = "yolo_operation_release")] internal static partial int OperationRelease(ulong operation);
    [LibraryImport(Library, EntryPoint = "yolo_process_spawn")] internal static partial int ProcessSpawn(ulong runtime, SpawnInfo* info, ulong* process);
    [LibraryImport(Library, EntryPoint = "yolo_process_status")] internal static partial int ProcessStatusGet(ulong process, ProcessStatus* status);
    [LibraryImport(Library, EntryPoint = "yolo_process_read")] internal static partial int ProcessRead(ulong process, uint stream, uint mode, Buffer* output);
    [LibraryImport(Library, EntryPoint = "yolo_process_output_complete")] internal static partial int ProcessOutputComplete(ulong process, uint* complete);
    [LibraryImport(Library, EntryPoint = "yolo_process_stop")] internal static partial int ProcessStop(ulong process, uint graceMs);
    [LibraryImport(Library, EntryPoint = "yolo_process_release")] internal static partial int ProcessRelease(ulong process);
    [LibraryImport(Library, EntryPoint = "yolo_http_probe_start")] internal static partial int HttpProbeStart(ulong runtime, byte* host, ushort port, byte* path, uint timeoutMs, ulong* operation);
    [LibraryImport(Library, EntryPoint = "yolo_buffer_free")] internal static partial void BufferFree(Buffer* buffer);
    [LibraryImport(Library, EntryPoint = "yolo_last_error")] internal static partial int LastError(Buffer* output);
    [LibraryImport(Library, EntryPoint = "ffi_sum_squares")] internal static partial double SumSquares(double* values, nuint length);

    static Native() => NativeLibrary.SetDllImportResolver(typeof(Native).Assembly, Resolve);

    /// <summary>YOLO_RUNTIME_LIB, then the application directory, then the nearest target/runtime above it.</summary>
    private static IntPtr Resolve(string name, Assembly assembly, DllImportSearchPath? searchPath)
    {
        if (name != Library) return IntPtr.Zero;
        var explicitPath = Environment.GetEnvironmentVariable("YOLO_RUNTIME_LIB");
        if (!string.IsNullOrEmpty(explicitPath)) return NativeLibrary.Load(explicitPath);
        var file = FileName();
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            foreach (var candidate in new[] { Path.Combine(dir.FullName, file), Path.Combine(dir.FullName, "target", "runtime", file) })
                if (File.Exists(candidate)) return NativeLibrary.Load(candidate);
        }
        return NativeLibrary.TryLoad(name, assembly, searchPath, out var handle) ? handle : IntPtr.Zero;
    }

    internal static string FileName() =>
        OperatingSystem.IsWindows() ? "yolo_runtime.dll" : OperatingSystem.IsMacOS() ? "libyolo_runtime.dylib" : "libyolo_runtime.so";

    internal static string TakeString(ref Buffer buffer)
    {
        fixed (Buffer* p = &buffer)
        {
            try
            {
                return buffer.Len == 0 ? "" : System.Text.Encoding.UTF8.GetString(buffer.Data, checked((int)buffer.Len));
            }
            finally
            {
                BufferFree(p);
            }
        }
    }

    internal static byte[] TakeBytes(ref Buffer buffer)
    {
        fixed (Buffer* p = &buffer)
        {
            try
            {
                return buffer.Len == 0 ? [] : new ReadOnlySpan<byte>(buffer.Data, checked((int)buffer.Len)).ToArray();
            }
            finally
            {
                BufferFree(p);
            }
        }
    }
}
