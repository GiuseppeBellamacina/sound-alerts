# Tries scripts/mode.ps1 on made-up transcripts: the last mode recorded wins, nothing recorded says so, a missing file is an error,
# and only the last 6 MB are read.
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot '..\..\scripts\mode.ps1'
$passed = 0; $failed = 0
function Run([string]$Path) { [string](& powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $script -Path $Path) }
function Check($label, $got, $want) { if ("$got" -eq "$want") { $script:passed++ } else { $script:failed++; "FAIL $label`n   want: $want`n   got:  $got" } }

$work = Join-Path ([IO.Path]::GetTempPath()) ('sound-alerts-mode-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $row = { param($mode, $text) '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"' + $text + '"}]},"permissionMode":"' + $mode + '","origin":{"kind":"human"}}' }

  $one = Join-Path $work 'one.jsonl'
  Set-Content -Path $one -Encoding UTF8 -Value @((& $row 'default' 'ciao'), (& $row 'auto' 'à è ì ò ù'), '{"type":"assistant"}')
  Check 'the last mode recorded wins' (Run $one) 'ok:auto'

  Set-Content -Path $one -Encoding UTF8 -Value @((& $row 'auto' 'a'), (& $row 'acceptEdits' 'b'))
  Check 'another mode' (Run $one) 'ok:acceptEdits'

  $none = Join-Path $work 'none.jsonl'
  Set-Content -Path $none -Encoding UTF8 -Value @('{"type":"assistant"}', '{"type":"system"}')
  Check 'no mode recorded' (Run $none) 'ok:'

  Check 'a file that is not there' (Run (Join-Path $work 'missing.jsonl')) 'error:no such file'

  # Only the last 6 MB are read: a mode further back is not seen, one inside the tail is.
  $big = Join-Path $work 'big.jsonl'
  $filler = '{"type":"assistant","text":"' + ('x' * 1000) + '"}'
  $lines = @(& $row 'auto' 'old') + (1..7000 | ForEach-Object { $filler })
  Set-Content -Path $big -Encoding UTF8 -Value $lines
  Check 'a file over 6 MB' ((Get-Item $big).Length -gt 6MB) 'True'
  Check 'a mode beyond the tail is not seen' (Run $big) 'ok:'
  Add-Content -Path $big -Encoding UTF8 -Value (& $row 'default' 'new')
  Check 'a mode inside the tail is' (Run $big) 'ok:default'

  # A file the engine is still writing can be read.
  $open = Join-Path $work 'open.jsonl'
  Set-Content -Path $open -Encoding UTF8 -Value (& $row 'plan' 'p')
  $writer = [System.IO.File]::Open($open, 'Append', 'Write', 'ReadWrite')
  try { Check 'a file held open for writing' (Run $open) 'ok:plan' } finally { $writer.Dispose() }
}
finally { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
"$passed passed, $failed failed"
if ($failed -gt 0) { exit 1 }
