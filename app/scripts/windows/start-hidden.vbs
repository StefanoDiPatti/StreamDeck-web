' Vibe Deck - avvia l'icona nell'area di notifica senza finestre.
' Usato dal collegamento sul desktop, dall'avvio automatico e da start.bat.
' Con /panel (collegamento sul desktop) apre anche il pannello di controllo;
' se la dock e' gia' avviata apre solo il pannello.
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
tray = fso.BuildPath(here, "tray.ps1")
extra = ""
For Each a In WScript.Arguments
  If LCase(a) = "/panel" Then extra = " -Panel"
Next
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File """ & tray & """" & extra, 0, False
