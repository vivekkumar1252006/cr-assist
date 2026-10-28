param(
  [Parameter(Mandatory=$true)][string]$OutFile,   # supervisor output file (contains 'your url is: ...')
  [Parameter(Mandatory=$true)][int]$LocalPort,    # local port this tunnel proxies
  [Parameter(Mandatory=$true)][string]$TestPath   # path to test (e.g. / or /api/health)
)
$ErrorActionPreference = "SilentlyContinue"
while ($true) {
  $line = Select-String -Path $OutFile -Pattern 'your url is: (https://\S+)' | Select-Object -Last 1
  if ($line) {
    $url = $line.Matches[0].Groups[1].Value
    $code = & curl.exe --noproxy "*" -s -o NUL -w "%{http_code}" -m 15 -H "bypass-tunnel-Reminder: 1" "$url$TestPath"
    if ("$code" -ne "200") {
      "[{0}] tunnel {1} unhealthy (code={2}) -> restarting client" -f (Get-Date -Format HH:mm:ss), $url, $code
      Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -match "localtunnel --port $LocalPort" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
      Start-Sleep 12
      continue
    }
  }
  Start-Sleep 45
}
