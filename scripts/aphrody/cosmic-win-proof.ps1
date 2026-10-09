param([string]$Exe, [string]$Name, [string[]]$ArgList = @(), [int]$TimeoutSec = 60)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing, System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class W {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public struct RECT { public int L, T, R, B; }
}
"@
[W]::SetProcessDPIAware() | Out-Null
$p = if ($ArgList.Count) { Start-Process -FilePath $Exe -ArgumentList $ArgList -PassThru } else { Start-Process -FilePath $Exe -PassThru }
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$el = $null
while ((Get-Date) -lt $deadline -and -not $el) {
  Start-Sleep -Milliseconds 500
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
  foreach ($c in [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)) {
    if ($c.Current.BoundingRectangle.Width -gt 100 -and $c.Current.BoundingRectangle.Height -gt 100) { $el = $c; break }
  }
  if ($p.HasExited) { break }
}
if (-not $el) { "FAIL $Name : no top-level window (exited=$($p.HasExited))"; if (-not $p.HasExited) { $p.Kill() }; exit 1 }
Start-Sleep -Seconds 3
$h = [IntPtr]$el.Current.NativeWindowHandle
[W]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 800
$r = New-Object W+RECT; [W]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.R - $r.L; $hh = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap $w, $hh
$g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
$png = "C:\bun\docs\aphrody\merge\img\cosmic-win-$Name.png"
New-Item -ItemType Directory -Force (Split-Path $png) | Out-Null
$bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
# Responds: UIA still reaches the window and the process is not hung.
$p.Refresh()
$responding = $p.Responding
$children = $el.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition).Count
"OK $Name pid=$($p.Id) title='$($el.Current.Name)' class=$($el.Current.ClassName) size=${w}x$hh responding=$responding uiaDescendants=$children png=$png"
$p.Kill()
