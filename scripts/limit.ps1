# Reads what the last reply of a session transcript was: a usage limit that rejected the request, or anything else. Says so on one line:
# ok:<window>|<resetsAt as epoch seconds> for a limit (the window is five_hour, seven_day, ...), ok: for any other last reply, or
# error:<why>. Reads the last 1 MB of the file; writes nothing, no network.
param(
  [Parameter(Mandatory = $true)][string]$Path
)

$ErrorActionPreference = 'Stop'
try {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'no such file' }
  $stream = [System.IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')
  try {
    $keep = [Math]::Min($stream.Length, 1MB)
    [void]$stream.Seek(-$keep, 'End')
    $bytes = New-Object byte[] $keep
    $read = 0
    while ($read -lt $keep) {
      $n = $stream.Read($bytes, $read, $keep - $read)
      if ($n -le 0) { break }
      $read += $n
    }
  }
  finally { $stream.Dispose() }
  $text = [System.Text.Encoding]::UTF8.GetString($bytes, 0, $read)
  $last = ''
  foreach ($line in $text.Split("`n")) { if ($line.Contains('"type":"assistant"')) { $last = $line } }
  if ($last.Contains('"error":"rate_limit"')) {
    $kind = [regex]::Match($last, '"rateLimitType":"([A-Za-z_]+)"')
    $reset = [regex]::Match($last, '"resetsAt":([0-9]+)')
    if ($kind.Success -and $reset.Success) { Write-Output ('ok:' + $kind.Groups[1].Value + '|' + $reset.Groups[1].Value) } else { Write-Output 'ok:' }
  }
  else { Write-Output 'ok:' }
}
catch {
  Write-Output ('error:' + $_.Exception.Message)
}
