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

$last = ''
while ($true) {
  $obj = @{ title = ''; artist = ''; app = ''; playing = $false }
  $s = $mgr.GetCurrentSession()
  if ($s) {
    $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $obj.title = [string]$p.Title; $obj.artist = [string]$p.Artist
    $obj.app = ([string]$s.SourceAppUserModelId) -replace '\.exe$', ''
    $obj.playing = ([string]$s.GetPlaybackInfo().PlaybackStatus -eq 'Playing')
  }
  $json = $obj | ConvertTo-Json -Compress
  if ($json -ne $last) { $last = $json; [Console]::Out.WriteLine($json); [Console]::Out.Flush() }
  Start-Sleep -Milliseconds 1000
}
