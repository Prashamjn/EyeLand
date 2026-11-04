param([string]$Mode = 'watch', [string]$Target = '', [int]$Value = 0)
$ErrorActionPreference = 'SilentlyContinue'

function Out-Line($s) { [Console]::Out.WriteLine($s); [Console]::Out.Flush() }
function Out-Err($s)  { [Console]::Error.WriteLine($s); [Console]::Error.Flush() }

$code = @'
using System;
using System.Text;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr p);
  int UnregisterControlChangeNotify(IntPtr p);
  int GetChannelCount(out uint c);
  int SetMasterVolumeLevel(float l, ref Guid g);
  int SetMasterVolumeLevelScalar(float l, ref Guid g);
  int GetMasterVolumeLevel(out float l);
  int GetMasterVolumeLevelScalar(out float l);
  int SetChannelVolumeLevel(uint n, float l, ref Guid g);
  int SetChannelVolumeLevelScalar(uint n, float l, ref Guid g);
  int GetChannelVolumeLevel(uint n, out float l);
  int GetChannelVolumeLevelScalar(uint n, out float l);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid g);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool m);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(int flow, int mask, out IntPtr devices);
  int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject { }

public class EyelandAudio {
  public static string LastError = "";
  static IAudioEndpointVolume ep;

  static IAudioEndpointVolume Ep() {
    if (ep == null) {
      IMMDeviceEnumerator en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDevice dev;
      Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev));   // eRender, eMultimedia
      Guid id = typeof(IAudioEndpointVolume).GUID;
      object o;
      Marshal.ThrowExceptionForHR(dev.Activate(ref id, 23, IntPtr.Zero, out o)); // CLSCTX_ALL
      ep = (IAudioEndpointVolume)o;
    }
    return ep;
  }
  public static void Refresh() { ep = null; }
  public static int GetVol() {
    try { float l; Marshal.ThrowExceptionForHR(Ep().GetMasterVolumeLevelScalar(out l)); return (int)Math.Round(l * 100); }
    catch (Exception e) { LastError = e.ToString(); ep = null; return -1; }
  }
  public static bool GetMute() {
    try { bool m; Marshal.ThrowExceptionForHR(Ep().GetMute(out m)); return m; }
    catch (Exception e) { LastError = e.ToString(); ep = null; return false; }
  }
  public static void SetVol(int v) {
    Guid g = Guid.Empty;
    Marshal.ThrowExceptionForHR(Ep().SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, v)) / 100f, ref g));
  }
  public static void ToggleMute() {
    Guid g = Guid.Empty;
    Marshal.ThrowExceptionForHR(Ep().SetMute(!GetMute(), ref g));
  }
}


public class EyelandWin {
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int idx);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);

  // True when the foreground window is a full-screen app (games, F11 browser, video players, slideshows).
  public static bool IsFullscreen() {
    try {
      int q; if (SHQueryUserNotificationState(out q) == 0 && (q == 2 || q == 3 || q == 4)) return true;
      IntPtr h = GetForegroundWindow(); if (h == IntPtr.Zero) return false;
      StringBuilder sb = new StringBuilder(64); GetClassName(h, sb, 64); string c = sb.ToString();
      if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd") return false;
      RECT r; if (!GetWindowRect(h, out r)) return false;
      MONITORINFO mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
      if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return false;
      bool covers = r.Left <= mi.rcMonitor.Left && r.Top <= mi.rcMonitor.Top && r.Right >= mi.rcMonitor.Right && r.Bottom >= mi.rcMonitor.Bottom;
      return covers && (GetWindowLong(h, -16) & 0x00C00000) == 0;   // covers the monitor and has no title bar
    } catch { return false; }
  }
}

public class EyelandKeys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@

try { Add-Type -TypeDefinition $code -ErrorAction Stop }
catch { Out-Err ("Add-Type failed: " + $_.Exception.Message); if ($_.Exception.InnerException) { Out-Err $_.Exception.InnerException.Message }; exit 2 }

if ($Mode -eq 'watch') {
  $lv = -2; $lm = $null; $lb = -2; $noBri = $false; $tick = 0; $lf = $null
  while ($true) {
    $v = [EyelandAudio]::GetVol(); $m = [EyelandAudio]::GetMute()
    if ($v -ge 0) {
      if ($v -ne $lv -or $m -ne $lm) { $lv = $v; $lm = $m; Out-Line ("vol|{0}|{1}" -f $v, [int]$m) }
    } elseif ($tick % 40 -eq 0) { Out-Err ("volume read failed: " + [EyelandAudio]::LastError) }

    if (-not $noBri -and ($tick % 4 -eq 0)) {
      $b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1
      if ($null -eq $b) { if ($lb -eq -2) { Out-Line 'bri|na'; $noBri = $true } }
      elseif ($b.CurrentBrightness -ne $lb) { $lb = $b.CurrentBrightness; Out-Line ("bri|{0}" -f $lb) }
    }
    if ($tick % 3 -eq 0) {
      $f = [EyelandWin]::IsFullscreen()
      if ($f -ne $lf) { $lf = $f; Out-Line ('fs|{0}' -f [int]$f) }
    }
    if ($tick % 80 -eq 0) { [EyelandAudio]::Refresh() }   # follow default-device changes
    $tick++; Start-Sleep -Milliseconds 100
  }
}
elseif ($Mode -eq 'set') {
  switch ($Target) {
    'vol'  { try { [EyelandAudio]::SetVol($Value) } catch { Out-Err $_.Exception.Message } }
    'mute' { try { [EyelandAudio]::ToggleMute() } catch { Out-Err $_.Exception.Message } }
    'bri'  { Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 0; Brightness = [byte][Math]::Max(0, [Math]::Min(100, $Value)) } | Out-Null }
  }
}
elseif ($Mode -eq 'key') {
  $vk = switch ($Target) { 'play' { 0xB3 } 'next' { 0xB0 } 'prev' { 0xB1 } default { 0 } }
  if ($vk) { [EyelandKeys]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero); [EyelandKeys]::keybd_event([byte]$vk, 0, 2, [UIntPtr]::Zero) }
}
