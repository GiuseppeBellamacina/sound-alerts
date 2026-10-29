# Reads the permission mode a session transcript last recorded (default, auto, acceptEdits, plan, ...) and says so on one line:
# ok:<mode>, ok: when none is recorded in the tail, or error:<why>. Reads the last 6 MB of the file; writes nothing, no network.
param(
  [Parameter(Mandatory = $true)][string]$Path
)

$ErrorActionPreference = 'Stop'
try {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'no such file' }
  $stream = [System.IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')
  try {
    $keep = [Math]::Min($stream.Length, 6MB)
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
  $found = [regex]::Matches($text, '"permissionMode":"([A-Za-z]+)"')
  if ($found.Count -gt 0) { Write-Output ('ok:' + $found[$found.Count - 1].Groups[1].Value) } else { Write-Output 'ok:' }
}
catch {
  Write-Output ('error:' + $_.Exception.Message)
}
