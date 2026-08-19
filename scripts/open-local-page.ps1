param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 65535)]
  [int]$Port
)

$uri = "http://127.0.0.1:$Port"
$deadline = (Get-Date).AddSeconds(90)

while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $uri -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      Start-Process $uri
      exit 0
    }
  } catch {
    # The local service is still starting. Keep waiting.
  }

  Start-Sleep -Seconds 1
}

exit 1
