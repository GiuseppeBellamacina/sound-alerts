# Plays one .wav file and says so on one line: ok:played, or error:<why>. No network, nothing written.
param(
  [Parameter(Mandatory = $true)][string]$Path
)

$ErrorActionPreference = 'Stop'
try {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw ('no such file: ' + $Path) }
  if ([IO.Path]::GetExtension($Path).ToLowerInvariant() -ne '.wav') { throw 'Windows plays .wav files only' }
  $player = New-Object System.Media.SoundPlayer $Path
  $player.PlaySync()
  Write-Output 'ok:played'
}
catch {
  Write-Output ('error:' + $_.Exception.Message)
}
