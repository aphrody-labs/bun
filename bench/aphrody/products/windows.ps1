Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class KernelBench { [DllImport("kernel32.dll")] public static extern uint GetCurrentProcessId(); }'
for ($i=0; $i -lt 10000; $i++) { $null = [KernelBench]::GetCurrentProcessId() }
$valid = $true
$watch = [Diagnostics.Stopwatch]::StartNew()
for ($i=0; $i -lt 100000; $i++) { $valid = $valid -and ([KernelBench]::GetCurrentProcessId() -eq $PID) }
$watch.Stop()
'BENCH_RESULT ' + (@{ value = $valid.ToString().ToLowerInvariant(); workMs = $watch.Elapsed.TotalMilliseconds } | ConvertTo-Json -Compress)

