# Command Dock - helper Windows persistente.
# Avviato una volta dal server Node: legge richieste JSON (una per riga) da stdin
# e risponde su stdout con righe "@@DOCK {json}". Tenerlo aperto evita i ~0.5s
# di avvio di PowerShell a ogni tocco sul tablet.
#
# Comandi: ping, keys, text, open, focus, nowplaying, art, net
# Richiede Windows PowerShell 5.1 (powershell.exe), che espone le API WinRT
# usate per "Now Playing".

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $utf8)
$stdout = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $utf8)
$stdout.AutoFlush = $true

function Send-Reply($obj) {
  $stdout.WriteLine('@@DOCK ' + (ConvertTo-Json -InputObject $obj -Compress -Depth 6))
}

Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class DockInput {
  [StructLayout(LayoutKind.Sequential)]
  struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)]
  struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)]
  struct INPUT { public uint type; public UNION u; }

  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

  const uint KEYUP = 0x2;
  const uint UNICODE = 0x4;
  const uint EXTENDED = 0x1;

  static bool IsExtended(ushort vk) {
    return (vk >= 0x21 && vk <= 0x2E) || (vk >= 0x5B && vk <= 0x5D) || (vk >= 0xA6 && vk <= 0xB7) || vk == 0x6F || vk == 0x90;
  }

  static INPUT Key(ushort vk, bool up) {
    INPUT i = new INPUT();
    i.type = 1;
    i.u.ki.wVk = vk;
    i.u.ki.dwFlags = (up ? KEYUP : 0) | (IsExtended(vk) ? EXTENDED : 0);
    return i;
  }

  static uint Send(INPUT[] list) {
    return SendInput((uint)list.Length, list, Marshal.SizeOf(typeof(INPUT)));
  }

  // Preme i tasti in ordine e li rilascia in ordine inverso (es. CTRL+SHIFT+S).
  public static uint Combo(ushort[] vks) {
    INPUT[] list = new INPUT[vks.Length * 2];
    for (int k = 0; k < vks.Length; k++) list[k] = Key(vks[k], false);
    for (int k = 0; k < vks.Length; k++) list[vks.Length + k] = Key(vks[vks.Length - 1 - k], true);
    return Send(list);
  }

  // Digita testo Unicode (accenti compresi). "\n" diventa INVIO.
  public static uint Text(string s) {
    System.Collections.Generic.List<INPUT> list = new System.Collections.Generic.List<INPUT>();
    foreach (char ch in s) {
      if (ch == '\r') continue;
      if (ch == '\n') { list.Add(Key(0x0D, false)); list.Add(Key(0x0D, true)); continue; }
      INPUT d = new INPUT(); d.type = 1; d.u.ki.wScan = ch; d.u.ki.dwFlags = UNICODE;
      INPUT u = new INPUT(); u.type = 1; u.u.ki.wScan = ch; u.u.ki.dwFlags = UNICODE | KEYUP;
      list.Add(d); list.Add(u);
    }
    if (list.Count == 0) return 0;
    return Send(list.ToArray());
  }

  // Porta in primo piano la finestra principale di un processo (es. "blender").
  public static bool Focus(string processName) {
    IntPtr h = IntPtr.Zero;
    foreach (Process p in Process.GetProcessesByName(processName)) {
      if (p.MainWindowHandle != IntPtr.Zero) { h = p.MainWindowHandle; break; }
    }
    if (h == IntPtr.Zero) return false;
    if (GetForegroundWindow() == h) return true;
    if (IsIconic(h)) ShowWindow(h, 9);
    // Un tocco di SHIFT fa risultare questo processo come "ultimo input",
    // condizione che Windows richiede per concedere SetForegroundWindow.
    Combo(new ushort[] { 0x10 });
    uint fg = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint me = GetCurrentThreadId();
    bool attached = fg != me && AttachThreadInput(me, fg, true);
    BringWindowToTop(h);
    bool ok = SetForegroundWindow(h);
    if (attached) AttachThreadInput(me, fg, false);
    return ok || GetForegroundWindow() == h;
  }
}
"@

# --- WinRT (Now Playing). Se non disponibile il resto continua a funzionare. ---
$script:winrt = $false
$script:mgr = $null
$script:thumb = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $script:asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  [void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $script:winrt = $true
} catch { }

function Await($op, [Type]$type) {
  $task = $script:asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  if (-not $task.Wait(4000)) { throw 'timeout WinRT' }
  return $task.Result
}

function Get-NowPlaying {
  if (-not $script:winrt) { return @{ supported = $false } }
  if ($null -eq $script:mgr) {
    $script:mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  }
  $s = $script:mgr.GetCurrentSession()
  if ($null -eq $s) { $script:thumb = $null; return @{ supported = $true; active = $false } }
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $pb = $s.GetPlaybackInfo()
  $tl = $s.GetTimelineProperties()
  $script:thumb = $p.Thumbnail
  return @{
    supported = $true
    active = $true
    app = [string]$s.SourceAppUserModelId
    title = [string]$p.Title
    artist = [string]$p.Artist
    album = [string]$p.AlbumTitle
    status = [string]$pb.PlaybackStatus
    position = [double]$tl.Position.TotalSeconds
    duration = [double]$tl.EndTime.TotalSeconds
    updatedAt = [double]$tl.LastUpdatedTime.ToUnixTimeMilliseconds()
    hasArt = ($null -ne $p.Thumbnail)
  }
}

function Get-Art {
  if ($null -eq $script:thumb) { return @{ ok = $false } }
  $stream = Await ($script:thumb.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  try {
    # PowerShell non sa convertire lo stream WinRT: la conversione a .NET
    # Stream si fa via reflection, che esegue il cast vero sul COM object.
    $m = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [type[]]@([Windows.Storage.Streams.IInputStream]))
    $net = $m.Invoke($null, @($stream))
    $ms = New-Object System.IO.MemoryStream
    $net.CopyTo($ms)
    $net.Dispose()
    if ($ms.Length -eq 0 -or $ms.Length -gt 4MB) { return @{ ok = $false } }
    $bytes = $ms.ToArray()
    $mime = 'image/jpeg'
    if ($bytes.Length -gt 3 -and $bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50) { $mime = 'image/png' }
    return @{ ok = $true; mime = $mime; data = [Convert]::ToBase64String($bytes) }
  } finally { try { ([System.IDisposable]$stream).Dispose() } catch { } }
}

function Get-Net {
  $rx = [double]0; $tx = [double]0
  foreach ($n in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($n.OperationalStatus -ne 'Up') { continue }
    $t = [string]$n.NetworkInterfaceType
    if ($t -eq 'Loopback' -or $t -eq 'Tunnel') { continue }
    if (($n.Name + ' ' + $n.Description) -match 'vEthernet|Hyper-V|VirtualBox|VMware|WSL|Loopback|Bluetooth') { continue }
    $st = $n.GetIPStatistics()
    $rx += $st.BytesReceived; $tx += $st.BytesSent
  }
  return @{ rx = $rx; tx = $tx }
}

function Open-Target($req) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = [string]$req.file
  if ($req.args) { $psi.Arguments = [string]$req.args }
  if ($req.cwd) { $psi.WorkingDirectory = [string]$req.cwd }
  $psi.UseShellExecute = $true
  [void][System.Diagnostics.Process]::Start($psi)
  return @{ started = $true }
}

Send-Reply @{ id = 0; ready = $true; winrt = $script:winrt }

while ($true) {
  $line = $stdin.ReadLine()
  if ($null -eq $line) { break }
  if ($line.Trim() -eq '') { continue }
  $id = $null
  try {
    $req = ConvertFrom-Json $line
    $id = $req.id
    switch ([string]$req.cmd) {
      'ping' { $data = @{ pong = $true } }
      'keys' { $data = @{ sent = [DockInput]::Combo([uint16[]]@($req.vks)) } }
      'text' { $data = @{ sent = [DockInput]::Text([string]$req.text) } }
      'focus' { $data = @{ focused = [DockInput]::Focus([string]$req.name) } }
      'open' { $data = Open-Target $req }
      'nowplaying' { $data = Get-NowPlaying }
      'art' { $data = Get-Art }
      'net' { $data = Get-Net }
      default { throw ('comando sconosciuto: ' + $req.cmd) }
    }
    Send-Reply @{ id = $id; ok = $true; data = $data }
  } catch {
    if ($_.Exception.Message -match 'WinRT|RequestAsync') { $script:mgr = $null }
    Send-Reply @{ id = $id; ok = $false; error = $_.Exception.Message }
  }
}
