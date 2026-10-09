// SPDX-License-Identifier: Apache-2.0
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using Aphrody.Yolo;
using Xunit;

namespace Aphrody.Yolo.Tests;

public sealed class RuntimeTests
{
    private static string Bun => Environment.GetEnvironmentVariable("BUN_EXE") is { Length: > 0 } exe ? exe : "bun";

    [Fact]
    public void AbiAndBuildInfo()
    {
        Assert.Equal((1u, 5u), YoloRuntime.AbiVersion);
        Assert.Equal(System.Text.Json.JsonValueKind.Object, YoloRuntime.BuildInfo().ValueKind);
    }

    [Fact]
    public void CapabilitiesAndStats()
    {
        using var runtime = new YoloRuntime();
        var caps = runtime.Capabilities();
        Assert.Contains("process.supervise", caps);
        Assert.Contains("http.probe", caps);
        Assert.Equal(System.Text.Json.JsonValueKind.Object, runtime.SystemStats().ValueKind);
    }

    [Fact]
    public void SumSquaresReadsCallerMemory()
    {
        Assert.Equal(14.0, YoloRuntime.SumSquares([1.0, 2.0, 3.0]));
        Assert.Equal(0.0, YoloRuntime.SumSquares([]));
    }

    [Fact]
    public void BenchCompletes()
    {
        using var runtime = new YoloRuntime();
        using var op = runtime.StartBench(1000);
        var result = op.Wait(30_000);
        Assert.NotNull(result);
    }

    [Fact]
    public void InvalidArgumentsThrowWithStatus()
    {
        Assert.Equal(YoloStatus.InvalidArgument, Assert.Throws<YoloException>(() => new YoloRuntime(maxOperations: 1000)).Status);
        using var runtime = new YoloRuntime();
        Assert.Throws<YoloException>(() => runtime.Spawn(new YoloSpawnOptions("yolo-no-such-program-" + Guid.NewGuid())));
        Assert.Throws<ArgumentException>(() => runtime.Spawn(new YoloSpawnOptions(Bun) { Env = new Dictionary<string, string> { ["A=B"] = "x" } }));
    }

    [Fact]
    public void DisposedRuntimeThrows()
    {
        var runtime = new YoloRuntime();
        runtime.Dispose();
        runtime.Dispose();
        Assert.Throws<ObjectDisposedException>(() => runtime.Capabilities());
    }

    [Fact]
    public async Task SpawnReportsExitCodeAndEnvironment()
    {
        using var runtime = new YoloRuntime();
        using var child = runtime.Spawn(new YoloSpawnOptions(Bun)
        {
            Args = ["-e", "console.log(process.env.YOLO_DOTNET); process.exit(7)"],
            Env = new Dictionary<string, string> { ["YOLO_DOTNET"] = "héllo" },
            Stdio = YoloStdio.CaptureLossless,
        });
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var status = await child.WaitForExitAsync(cts.Token);
        Assert.Equal(7, status.ExitCode);
        while (!child.OutputComplete) await Task.Delay(10, cts.Token);
        Assert.Equal("héllo", child.ReadText(YoloStream.Stdout).TrimEnd());
    }

    [Fact]
    public async Task StopTakesDescendantsDown()
    {
        using var runtime = new YoloRuntime();
        using var child = runtime.Spawn(new YoloSpawnOptions(Bun)
        {
            Args =
            [
                "-e",
                "const c = Bun.spawn([process.execPath, '-e', 'setInterval(() => {}, 1000)'], { stdio: ['ignore', 'ignore', 'ignore'] }); console.log(c.pid); setInterval(() => {}, 1000);",
            ],
            Stdio = YoloStdio.Capture,
        });
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var output = "";
        while (!output.Contains('\n'))
        {
            output += child.ReadText(YoloStream.Stdout);
            await Task.Delay(10, cts.Token);
        }
        using var grandchild = Process.GetProcessById(int.Parse(output.Trim()));
        Assert.False(grandchild.HasExited);
        Assert.False(child.Stop(2000).Running);
        await grandchild.WaitForExitAsync(cts.Token);
        Assert.True(grandchild.HasExited);
    }

    [Fact]
    public async Task HttpProbe()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = (ushort)((IPEndPoint)listener.LocalEndpoint).Port;
        var server = Task.Run(async () =>
        {
            using var client = await listener.AcceptTcpClientAsync();
            using var stream = client.GetStream();
            var request = new byte[1024];
            _ = await stream.ReadAsync(request);
            await stream.WriteAsync("HTTP/1.0 204 No Content\r\nContent-Length: 0\r\n\r\n"u8.ToArray());
        });

        using var runtime = new YoloRuntime();
        using var op = runtime.StartHttpProbe("127.0.0.1", port, "/health", 5000);
        var result = op.Wait(10_000);
        Assert.NotNull(result);
        Assert.Equal(204, result.Value.GetProperty("status").GetInt32());
        await server;
    }
}
