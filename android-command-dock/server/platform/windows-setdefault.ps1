# Command Dock - imposta il dispositivo audio predefinito (uscita o ingresso).
# Processo a parte: dentro l'helper sempre aperto la chiamata a Windows puo' durare
# molti secondi e bloccherebbe i tasti del tablet.
param([Parameter(Mandatory = $true)][string]$Id)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-mixer.ps1')
if (-not $script:mixer) { Write-Error 'mixer non disponibile'; exit 2 }
[DockMixer]::SetDefault($Id)
Write-Output 'ok'
