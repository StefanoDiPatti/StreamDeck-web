# Spegne i monitor (si riaccendono muovendo il mouse o premendo un tasto).
# Usato dal pulsante "SCHERMO OFF" tramite config/commands.json.
Add-Type -Namespace Dock -Name Monitor -MemberDefinition @'
[DllImport("user32.dll")]
public static extern bool PostMessage(System.IntPtr hWnd, uint msg, System.IntPtr wParam, System.IntPtr lParam);
'@
Start-Sleep -Milliseconds 300
# HWND_BROADCAST, WM_SYSCOMMAND, SC_MONITORPOWER, 2 = spento
[void][Dock.Monitor]::PostMessage([System.IntPtr]0xffff, 0x0112, [System.IntPtr]0xF170, [System.IntPtr]2)
