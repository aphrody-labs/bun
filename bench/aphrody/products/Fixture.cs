using System;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace ProductBench;
public static class Native
{
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static int Compute(int n)
    {
        int value = 0;
        for (int i = 0; i < n; i++) value += i;
        return value;
    }
    [UnmanagedCallersOnly]
    public static int Call(int n) => Compute(n);
}
public static class Program
{
    public static void Main(string[] args)
    {
        int n = args.Length == 0 ? 10 : int.Parse(args[0]);
        for (int i = 0; i < 100000; i++) Native.Compute(n);
        int value = 0;
        var watch = Stopwatch.StartNew();
        for (int i = 0; i < 100000; i++) value = Native.Compute(n);
        watch.Stop();
        Console.WriteLine("BENCH_RESULT " + JsonSerializer.Serialize(new { value = value.ToString(), workMs = watch.Elapsed.TotalMilliseconds }));
    }
}

