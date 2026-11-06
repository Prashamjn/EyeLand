# Streams "now playing" info (any app that talks to Windows' media controls: Spotify, browsers, VLC, Apple Music...)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) {
  $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null; $t.Result
}
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

# Album artwork: sent once per track as its own line {"art": base64, "key": "title|artist|app"}.
# Isolated in try/catch so a failure here can never break the title/artist/playing feed.
function Get-Art($p) {
  try {
    $ref = $p.Thumbnail; if (-not $ref) { return '' }
    $stream = Await ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if (-not $stream -or $stream.Size -le 0 -or $stream.Size -gt 3145728) { return '' }
    $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
    $ms = New-Object System.IO.MemoryStream
    $net.CopyTo($ms)
    return [Convert]::ToBase64String($ms.ToArray())
  } catch { return '' }
}

$last = ''; $artKey = ''; $artTries = 0
while ($true) {
  $obj = @{ title = ''; artist = ''; app = ''; playing = $false }
  $s = $null
  foreach ($candidate in @($mgr.GetSessions())) {
    $candidateInfo = $candidate.GetPlaybackInfo()
    if ($candidateInfo -and ([string]$candidateInfo.PlaybackStatus) -eq 'Playing') { $s = $candidate; break }
  }
  if (-not $s) { $s = $mgr.GetCurrentSession() }
  if ($s) {
    $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $obj.title = [string]$p.Title; $obj.artist = [string]$p.Artist
    $obj.app = ([string]$s.SourceAppUserModelId) -replace '\.exe$', ''
    $info = $s.GetPlaybackInfo()
    if ($info -and ([string]$info.PlaybackStatus) -eq 'Playing') { $obj.playing = $true }
  }
  $json = $obj | ConvertTo-Json -Compress
  if ($json -ne $last) { $last = $json; [Console]::Out.WriteLine($json); [Console]::Out.Flush() }
  $key = '{0}|{1}|{2}' -f $obj.title, $obj.artist, $obj.app
  if ($s -and $obj.title -and $key -ne $artKey) {
    $art = Get-Art $p
    if ($art) { [Console]::Out.WriteLine((@{ art = $art; key = $key } | ConvertTo-Json -Compress)); [Console]::Out.Flush(); $artKey = $key; $artTries = 0 }
    elseif (++$artTries -ge 3) { $artKey = $key; $artTries = 0 }   # no artwork for this track, stop asking
  }
  Start-Sleep -Milliseconds 1000
}
