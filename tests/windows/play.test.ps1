# Tries scripts/play.ps1 for real. A runner has no sound card, so playing may answer an error: what is checked is that
# the script always answers one line, ok:... or error:..., and refuses what is not a .wav file or is not there.
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot '..\..\scripts\play.ps1'
$passed = 0; $failed = 0
function Run([string[]]$Arguments) { [string](& powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $script @Arguments) }
function Check($label, $got, $want) { if ("$got" -eq "$want") { $script:passed++ } else { $script:failed++; "FAIL $label`n   want: $want`n   got:  $got" } }
function Like($label, $got, $pattern) { if ("$got" -match $pattern) { $script:passed++ } else { $script:failed++; "FAIL $label`n   want it to match: $pattern`n   got: $got" } }

$work = Join-Path ([IO.Path]::GetTempPath()) ('sound-alerts-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  Like 'a file that is not there' (Run @('-Path', (Join-Path $work 'none.wav'))) '^error:no such file: '
  $ogg = Join-Path $work 'x.ogg'; Set-Content $ogg 'not audio'
  Check 'a format Windows does not play here' (Run @('-Path', $ogg)) 'error:Windows plays .wav and .mp3 files'
  # An .mp3 goes through the media player: one that is not audio is refused in a line, not left playing.
  $mp3 = Join-Path $work 'x.mp3'; Set-Content $mp3 'not audio'
  Check 'an mp3 that is not audio' (Run @('-Path', $mp3)) 'error:the file could not be read as audio'
  $bad = Join-Path $work 'bad.wav'; Set-Content $bad 'not a wav'
  Like 'a .wav that is not one says why, in one line' (Run @('-Path', $bad)) '^error:.+'
  foreach ($preset in 'soft', 'retro') {
    $out = Run @('-Path', (Join-Path $PSScriptRoot "..\..\presets\$preset\done.wav"))
    Like "the $preset sound answers one line" $out '^(ok:played|error:[^\r\n]+)$'
  }
  # A path with spaces reaches the script whole.
  $dir = Join-Path $work 'a folder'; New-Item -ItemType Directory -Path $dir | Out-Null
  Copy-Item (Join-Path $PSScriptRoot '..\..\presets\soft\done.wav') (Join-Path $dir 'my sound.wav')
  Like 'a path with spaces' (Run @('-Path', (Join-Path $dir 'my sound.wav'))) '^(ok:played|error:[^\r\n]+)$'
}
finally { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
"$passed passed, $failed failed"
if ($failed -gt 0) { exit 1 }
