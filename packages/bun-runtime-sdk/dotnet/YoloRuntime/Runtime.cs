// SPDX-License-Identifier: Apache-2.0
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Aphrody.Yolo;

/// <summary>Status codes of the C ABI.</summary>
public enum YoloStatus
{
    Ok = 0,
    InvalidArgument = 1,
    AbiMismatch = 2,
    InvalidHandle = 3,
    Cancelled = 4,
    Timeout = 5,
    Busy = 6,
    Internal = 7,
    Panic = 8,
    OutputLimit = 9,
}

/// <summary>A non-OK status, with the calling thread's last error message from the library.</summary>
public sealed class YoloException(YoloStatus status, string message) : Exception($"{message} ({status})")
{
    public YoloStatus Status { get; } = status;

    internal static unsafe void Check(int status, string call)
    {
        if (status == 0) return;
        var buffer = default(Native.Buffer);
        var detail = Native.LastError(&buffer) == 0 ? Native.TakeString(ref buffer) : "";
        var message = call;
        try
        {
            if (detail.Length > 0
                && JsonDocument.Parse(detail).RootElement.TryGetProperty("message", out var m)
                && m.GetString() is { Length: > 0 } text)
                message = $"{call}: {text}";
        }
        catch (JsonException)
        {
        }
        throw new YoloException((YoloStatus)status, message);
    }
}

/// <summary>Owner of a native runtime handle. Every operation and process it hands out must be disposed.</summary>
public sealed unsafe class YoloRuntime : IDisposable
{
    private readonly Lock _lock = new();
    private ulong _handle;

    /// <summary>(major, minor) of the loaded library.</summary>
    public static (uint Major, uint Minor) AbiVersion
    {
        get
        {
            var v = Native.AbiVersion();
            return (v >> 16, v & 0xFFFF);
        }
    }

    /// <summary>Loads the library and creates a runtime; refuses another major ABI or an older minor.</summary>
    public YoloRuntime(uint maxOperations = 4)
    {
        var (major, minor) = AbiVersion;
        if (major != Native.AbiMajor || minor < Native.AbiMinor)
            throw new YoloException(YoloStatus.AbiMismatch, $"library ABI {major}.{minor}, binding needs {Native.AbiMajor}.{Native.AbiMinor}");
        var info = new Native.CreateInfo
        {
            StructSize = (uint)sizeof(Native.CreateInfo),
            AbiMajor = Native.AbiMajor,
            AbiMinor = Native.AbiMinor,
            MaxOperations = maxOperations,
        };
        ulong handle;
        YoloException.Check(Native.RuntimeCreate(&info, &handle), "yolo_runtime_create");
        _handle = handle;
    }

    private ulong Handle => _handle != 0 ? _handle : throw new ObjectDisposedException(nameof(YoloRuntime));

    /// <summary>JSON object describing the library build.</summary>
    public static JsonElement BuildInfo()
    {
        var buffer = default(Native.Buffer);
        YoloException.Check(Native.RuntimeBuildInfo(&buffer), "yolo_runtime_build_info");
        return Parse(Native.TakeString(ref buffer));
    }

    /// <summary>Capability names such as "process.supervise" or "http.probe".</summary>
    public string[] Capabilities()
    {
        var buffer = default(Native.Buffer);
        lock (_lock) YoloException.Check(Native.RuntimeCapabilities(Handle, &buffer), "yolo_runtime_capabilities");
        return JsonSerializer.Deserialize(Native.TakeString(ref buffer), YoloJson.Default.StringArray) ?? [];
    }

    public JsonElement SystemStats()
    {
        var buffer = default(Native.Buffer);
        lock (_lock) YoloException.Check(Native.SystemStats(Handle, &buffer), "yolo_system_stats");
        return Parse(Native.TakeString(ref buffer));
    }

    /// <summary>Starts the "bench.compute" workload on a library worker.</summary>
    public YoloOperation StartBench(uint iterations)
    {
        ulong op;
        lock (_lock) YoloException.Check(Native.BenchStart(Handle, iterations, &op), "yolo_bench_start");
        return new YoloOperation(op);
    }

    /// <summary>One HTTP/1.0 GET on a worker; the result is {"status": n} or {"status": null, "error": "..."}.</summary>
    public YoloOperation StartHttpProbe(string host, ushort port, string path = "/", uint timeoutMs = 1000)
    {
        var hostBytes = Utf8Z(host);
        var pathBytes = Utf8Z(path);
        ulong op;
        fixed (byte* h = hostBytes)
        fixed (byte* p = pathBytes)
        {
            lock (_lock) YoloException.Check(Native.HttpProbeStart(Handle, h, port, p, timeoutMs, &op), "yolo_http_probe_start");
        }
        return new YoloOperation(op);
    }

    /// <summary>Spawns a supervised child. On Windows the child and its descendants share a Job Object.</summary>
    public YoloProcess Spawn(YoloSpawnOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var env = options.Env?.Select(kv => kv.Key.Length == 0 || kv.Key.Contains('=')
            ? throw new ArgumentException($"invalid environment key '{kv.Key}'", nameof(options))
            : $"{kv.Key}={kv.Value}").ToList();
        var flags = options.Stdio switch
        {
            YoloStdio.Null => 1u,
            YoloStdio.Capture => 2u,
            YoloStdio.CaptureLossless => 4u,
            _ => throw new ArgumentOutOfRangeException(nameof(options)),
        };
        using var arena = new NativeArena();
        var info = new Native.SpawnInfoV14
        {
            Base = new Native.SpawnInfo
            {
                StructSize = (uint)sizeof(Native.SpawnInfoV14),
                Flags = flags,
                Program = arena.String(options.Program),
                Args = options.Args is { Count: > 0 } args ? arena.Strings(args) : null,
                Env = env is { Count: > 0 } ? arena.Strings(env) : null,
                Cwd = options.Cwd is { } cwd ? arena.String(cwd) : null,
            },
            CaptureLimit = options.CaptureLimit,
        };
        ulong process;
        lock (_lock) YoloException.Check(Native.ProcessSpawn(Handle, &info.Base, &process), "yolo_process_spawn");
        return new YoloProcess(process);
    }

    /// <summary>Sum of squares computed by the library on the caller's memory, without a copy.</summary>
    public static double SumSquares(ReadOnlySpan<double> values)
    {
        fixed (double* p = values) return Native.SumSquares(p, (nuint)values.Length);
    }

    /// <summary>Cancels and joins every operation, then invalidates the runtime.</summary>
    public void Dispose()
    {
        lock (_lock)
        {
            if (_handle == 0) return;
            var handle = _handle;
            _handle = 0;
            YoloException.Check(Native.RuntimeDestroy(handle), "yolo_runtime_destroy");
        }
    }

    internal static JsonElement Parse(string json) => JsonDocument.Parse(json).RootElement.Clone();

    internal static byte[] Utf8Z(string value)
    {
        if (value.Contains('\0')) throw new ArgumentException("NUL is not allowed in native strings");
        var bytes = new byte[Encoding.UTF8.GetByteCount(value) + 1];
        Encoding.UTF8.GetBytes(value, bytes);
        return bytes;
    }

    /// <summary>NUL-terminated UTF-8 strings and string arrays that live until the native call returns.</summary>
    private sealed class NativeArena : IDisposable
    {
        private readonly List<IntPtr> _blocks = [];

        public byte* String(string value)
        {
            var bytes = Utf8Z(value);
            var mem = (byte*)NativeMemory.Alloc((nuint)bytes.Length);
            _blocks.Add((IntPtr)mem);
            bytes.CopyTo(new Span<byte>(mem, bytes.Length));
            return mem;
        }

        public byte** Strings(IReadOnlyList<string> values)
        {
            var mem = (byte**)NativeMemory.AllocZeroed((nuint)(values.Count + 1), (nuint)sizeof(byte*));
            _blocks.Add((IntPtr)mem);
            for (var i = 0; i < values.Count; i++) mem[i] = String(values[i]);
            return mem;
        }

        public void Dispose()
        {
            foreach (var block in _blocks) NativeMemory.Free((void*)block);
        }
    }
}

[JsonSerializable(typeof(string[]))]
internal sealed partial class YoloJson : JsonSerializerContext;
