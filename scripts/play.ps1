# Plays one .wav or .mp3 file and says so on one line: ok:played, or error:<why>. No network, nothing written.
# A .wav goes through SoundPlayer; an .mp3 (or .m4a) through the system's media player, which SoundPlayer cannot do.
param(
  [Parameter(Mandatory = $true)][string]$Path
)

$ErrorActionPreference = 'Stop'
try {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw ('no such file: ' + $Path) }
  $ext = [IO.Path]::GetExtension($Path).ToLowerInvariant()
  if ($ext -eq '.wav') {
    $player = New-Object System.Media.SoundPlayer $Path
    $player.PlaySync()
  }
  elseif ($ext -eq '.mp3' -or $ext -eq '.m4a') {
    Add-Type -AssemblyName PresentationCore
    $media = New-Object System.Windows.Media.MediaPlayer
    $media.Open([Uri](Resolve-Path -LiteralPath $Path).ProviderPath)
    $media.Play()
    # The length is known a moment after Open; a clip is played to its end, but never for more than 30 seconds.
    $waited = 0
    while (-not $media.NaturalDuration.HasTimeSpan -and $waited -lt 3000) { Start-Sleep -Milliseconds 50; $waited += 50 }
    if (-not $media.NaturalDuration.HasTimeSpan) { $media.Close(); throw 'the file could not be read as audio' }
    $ms = [Math]::Min([int]$media.NaturalDuration.TimeSpan.TotalMilliseconds, 30000)
    Start-Sleep -Milliseconds ($ms + 150)
    $media.Close()
  }
  else { throw 'Windows plays .wav and .mp3 files' }
  Write-Output 'ok:played'
}
catch {
  Write-Output ('error:' + $_.Exception.Message)
}
