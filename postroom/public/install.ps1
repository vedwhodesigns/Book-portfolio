# Sets up Postroom on this Windows PC for Claude Code. Run in PowerShell:
#   irm https://vwd-postroom.vercel.app/install.ps1 | iex
# Installs:
#   %USERPROFILE%\postroom\postroom.mjs                        the command that uploads and schedules posts
#   %USERPROFILE%\.claude\skills\postroom\SKILL.md             every Claude Code chat learns how to use it
#   %USERPROFILE%\.claude\skills\how-it-clicks-captions\SKILL.md
#   %USERPROFILE%\.postroom.json                               your Postroom sign-in (asked once, hidden)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$Base = 'https://vwd-postroom.vercel.app'
$HomeDir = $env:USERPROFILE

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js is needed. Install the LTS version from https://nodejs.org, reopen PowerShell, then run this again.' -ForegroundColor Yellow
  return
}

$dirs = @("$HomeDir\postroom", "$HomeDir\.claude\skills\postroom", "$HomeDir\.claude\skills\how-it-clicks-captions")
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
Invoke-WebRequest -UseBasicParsing "$Base/postroom.mjs" -OutFile "$HomeDir\postroom\postroom.mjs"
Invoke-WebRequest -UseBasicParsing "$Base/postroom-skill.md" -OutFile "$HomeDir\.claude\skills\postroom\SKILL.md"
Invoke-WebRequest -UseBasicParsing "$Base/how-it-clicks-captions-skill.md" -OutFile "$HomeDir\.claude\skills\how-it-clicks-captions\SKILL.md"
Write-Host 'OK  Postroom command: ~\postroom\postroom.mjs' -ForegroundColor Green
Write-Host 'OK  Claude Code skills: postroom, how-it-clicks-captions' -ForegroundColor Green

$conf = "$HomeDir\.postroom.json"
if (-not (Test-Path $conf)) {
  $secure = Read-Host 'Postroom password (hidden)' -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({ password: process.argv[2] }))" "$conf" "$plain"
  Remove-Variable plain
}

& node "$HomeDir\postroom\postroom.mjs" accounts *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "OK  Signed in to Postroom. Done - ask any Claude Code chat to 'post this on Postroom'." -ForegroundColor Green
} else {
  Write-Host "Couldn't sign in. Delete $conf and run this again with the right password." -ForegroundColor Red
}
