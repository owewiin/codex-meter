Get-CimInstance Win32_Process -Filter "name='chrome.exe'" |
  Where-Object { $_.CommandLine -like '*codex-meter-manual-chrome-profile*' } |
  ForEach-Object {
    Write-Host "Stopping isolated manual Chrome PID $($_.ProcessId)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
