' Command Dock - avvia l'icona nell'area di notifica senza finestre.
' Usato dal collegamento sul desktop, dall'avvio automatico e da start.bat.
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
tray = fso.BuildPath(here, "tray.ps1")
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File """ & tray & """", 0, False
