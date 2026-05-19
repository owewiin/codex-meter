Get-CimInstance Win32_Process -Filter "name='chrome.exe'" |
  Where-Object { $_.CommandLine -like '*codex-meter-manual-chrome-profile*' } |
  Select-Object ProcessId,CommandLine |
  Format-List
