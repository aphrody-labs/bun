// SPDX-License-Identifier: Apache-2.0
using System.Text;
using System.Text.Json;

namespace Aphrody.Yolo;

public enum YoloStdio
{
    /// <summary>stdin, stdout and stderr go to the null device.</summary>
    Null,
    /// <summary>stdout and stderr captured, last 64 KiB of each.</summary>
    Capture,
    /// <summary>stdout and stderr captured completely, up to <see cref="YoloSpawnOptions.CaptureLimit"/>.</summary>
    CaptureLossless,
}

public sealed record YoloSpawnOptions(string Program)
{
    public IReadOnlyList<string>? Args { get; init; }
    /// <summary>Variables added to the inherited environment.</summary>
    public IReadOnlyDictionary<string, string>? Env { get; init; }
    public string? Cwd { get; init; }
    public YoloStdio Stdio { get; init; } = YoloStdio.Null;
    /// <summary>Per-stream budget for <see cref="YoloStdio.CaptureLossless"/>; 0 = 64 MiB.</summary>
    public ulong CaptureLimit { get; init; }
}

public readonly record struct YoloProcessStatus(bool Running, int ExitCode, int Signal, uint Pid);

public enum YoloStream : uint
{
    Stdout = 1,
    Stderr = 2,
}

/// <summary>A worker-side operation (bench, HTTP probe). Dispose cancels and joins it.</summary>
public sealed unsafe class YoloOperation : IDisposable
{
    private ulong _handle;

    internal YoloOperation(ulong handle) => _handle = handle;

    private ulong Handle => _handle != 0 ? _handle : throw new ObjectDisposedException(nameof(YoloOperation));

    /// <summary>The JSON result, or null when the operation is still running after <paramref name="timeoutMs"/>.</summary>
    public JsonElement? Wait(uint timeoutMs)
    {
        var buffer = default(Native.Buffer);
        var status = Native.OperationWait(Handle, timeoutMs, &buffer);
        if (status == (int)YoloStatus.Timeout) return null;
        YoloException.Check(status, "yolo_operation_wait");
        return YoloRuntime.Parse(Native.TakeString(ref buffer));
    }

    public void Cancel() => YoloException.Check(Native.OperationCancel(Handle), "yolo_operation_cancel");

    public void Dispose()
    {
        if (_handle == 0) return;
        var handle = _handle;
        _handle = 0;
        YoloException.Check(Native.OperationRelease(handle), "yolo_operation_release");
    }
}

/// <summary>A supervised child process. Dispose stops it (2 s grace) and releases the handle.</summary>
public sealed class YoloProcess : IDisposable
{
    private ulong _handle;

    internal YoloProcess(ulong handle) => _handle = handle;

    private ulong Handle => _handle != 0 ? _handle : throw new ObjectDisposedException(nameof(YoloProcess));

    public unsafe YoloProcessStatus Status()
    {
        var s = new Native.ProcessStatus { StructSize = (uint)sizeof(Native.ProcessStatus) };
        YoloException.Check(Native.ProcessStatusGet(Handle, &s), "yolo_process_status");
        return new YoloProcessStatus(s.State == 0, s.ExitCode, s.Signal, s.Pid);
    }

    /// <summary>Captured bytes; <paramref name="peek"/> leaves them in the library buffer.</summary>
    public unsafe byte[] Read(YoloStream stream, bool peek = false)
    {
        var buffer = default(Native.Buffer);
        YoloException.Check(Native.ProcessRead(Handle, (uint)stream, peek ? 1u : 0u, &buffer), "yolo_process_read");
        return Native.TakeBytes(ref buffer);
    }

    public string ReadText(YoloStream stream, bool peek = false) => Encoding.UTF8.GetString(Read(stream, peek));

    /// <summary>True once both output readers reached end of stream.</summary>
    public unsafe bool OutputComplete
    {
        get
        {
            uint complete;
            YoloException.Check(Native.ProcessOutputComplete(Handle, &complete), "yolo_process_output_complete");
            return complete != 0;
        }
    }

    /// <summary>Graceful stop, forced after <paramref name="graceMs"/>; on Windows the whole job is terminated.</summary>
    public unsafe YoloProcessStatus Stop(uint graceMs = 2000)
    {
        YoloException.Check(Native.ProcessStop(Handle, graceMs), "yolo_process_stop");
        return Status();
    }

    public async Task<YoloProcessStatus> WaitForExitAsync(CancellationToken cancellationToken = default)
    {
        while (true)
        {
            var status = Status();
            if (!status.Running) return status;
            await Task.Delay(10, cancellationToken).ConfigureAwait(false);
        }
    }

    public void Dispose()
    {
        if (_handle == 0) return;
        var handle = _handle;
        _handle = 0;
        YoloException.Check(Native.ProcessRelease(handle), "yolo_process_release");
    }
}
