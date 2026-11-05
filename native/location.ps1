# One-shot location read through the Windows location service.
# Prints one JSON line: {"ok":true,"lat":..,"lon":..} or {"ok":false,"error":"denied|unknown|unavailable"}
$ErrorActionPreference = 'SilentlyContinue'
function Out-Json($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
try { Add-Type -AssemblyName System.Device -ErrorAction Stop } catch { Out-Json @{ ok = $false; error = 'unavailable' }; exit 0 }
$w = New-Object System.Device.Location.GeoCoordinateWatcher([System.Device.Location.GeoPositionAccuracy]::Default)
$started = $w.TryStart($false, [TimeSpan]::FromSeconds(10))
if ($w.Permission -eq [System.Device.Location.GeoPositionPermission]::Denied) { Out-Json @{ ok = $false; error = 'denied' }; exit 0 }
if (-not $started) { Out-Json @{ ok = $false; error = 'unavailable' }; exit 0 }
$loc = $w.Position.Location
if ($null -eq $loc -or $loc.IsUnknown) { Out-Json @{ ok = $false; error = 'unknown' }; exit 0 }
Out-Json @{ ok = $true; lat = [double]$loc.Latitude; lon = [double]$loc.Longitude }
$w.Stop()
