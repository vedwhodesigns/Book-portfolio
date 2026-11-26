# Sets up Postroom on this Windows PC for Claude Code. Run in PowerShell:
#   irm https://vwd-postroom.vercel.app/install.ps1 | iex
# Installs:
#   %USERPROFILE%\postroom\postroom.mjs                        the command that uploads and schedules posts
#   %USERPROFILE%\.claude\skills\postroom\SKILL.md             every Claude Code chat learns how to use it
#   %USERPROFILE%\.claude\skills\how-it-clicks-captions\SKILL.md
#   %USERPROFILE%\.claude\skills\stream-clip-repeat\SKILL.md
#   %USERPROFILE%\.claude\skills\video-lab\SKILL.md              paste a YouTube/Instagram link → download + breakdown
#   yt-dlp and ffmpeg (through winget) for the video downloader
#   %USERPROFILE%\.postroom.json                               your Postroom sign-in (asked once, hidden)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$Base = 'https://vwd-postroom.vercel.app'
$HomeDir = $env:USERPROFILE

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js is needed. Install the LTS version from https://nodejs.org, reopen PowerShell, then run this again.' -ForegroundColor Yellow
  return
}

$dirs = @("$HomeDir\postroom", "$HomeDir\.claude\skills\postroom", "$HomeDir\.claude\skills\how-it-clicks-captions", "$HomeDir\.claude\skills\stream-clip-repeat", "$HomeDir\.claude\skills\video-lab")
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
Invoke-WebRequest -UseBasicParsing "$Base/postroom.mjs" -OutFile "$HomeDir\postroom\postroom.mjs"
Invoke-WebRequest -UseBasicParsing "$Base/postroom-skill.md" -OutFile "$HomeDir\.claude\skills\postroom\SKILL.md"
Invoke-WebRequest -UseBasicParsing "$Base/how-it-clicks-captions-skill.md" -OutFile "$HomeDir\.claude\skills\how-it-clicks-captions\SKILL.md"
Invoke-WebRequest -UseBasicParsing "$Base/stream-clip-repeat-skill.md" -OutFile "$HomeDir\.claude\skills\stream-clip-repeat\SKILL.md"
Invoke-WebRequest -UseBasicParsing "$Base/video-lab-skill.md" -OutFile "$HomeDir\.claude\skills\video-lab\SKILL.md"
Write-Host 'OK  Postroom command: ~\postroom\postroom.mjs' -ForegroundColor Green
Write-Host 'OK  Claude Code skills: postroom, how-it-clicks-captions, stream-clip-repeat, video-lab' -ForegroundColor Green

# Video Lab downloader: yt-dlp + ffmpeg
$need = @()
if (-not (Get-Command yt-dlp -ErrorAction SilentlyContinue)) { $need += 'yt-dlp.yt-dlp' }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { $need += 'Gyan.FFmpeg' }
if ($need.Count -gt 0) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    foreach ($pkg in $need) { try { winget install --id $pkg -e --accept-source-agreements --accept-package-agreements --silent | Out-Null } catch { Write-Host "Couldn't install $pkg - run: winget install $pkg" -ForegroundColor Yellow } }
    Write-Host 'OK  Installed the video downloader (yt-dlp, ffmpeg). Open a NEW PowerShell window before using "grab".' -ForegroundColor Green
  } else {
    Write-Host "For the video downloader, install: $($need -join ', ') (winget install <name>)" -ForegroundColor Yellow
  }
} else {
  # keep yt-dlp current: YouTube and Instagram change often
  try { if (Get-Command winget -ErrorAction SilentlyContinue) { winget upgrade --id yt-dlp.yt-dlp -e --silent --accept-source-agreements | Out-Null } } catch { }
  Write-Host 'OK  Video downloader ready (yt-dlp, ffmpeg)' -ForegroundColor Green
}
# Video Lab listening: earshot hears the music, Whisper writes down the words (both optional, both large)
$esUser = Get-ChildItem "$env:APPDATA\Python\Python*\Scripts\earshot.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (Get-Command earshot -ErrorAction SilentlyContinue) { Write-Host 'OK  earshot found: Video Lab will listen to the music' -ForegroundColor Green }
elseif ($esUser) { Write-Host "OK  earshot found in $($esUser.DirectoryName): Video Lab will listen to the music (that folder isn't on PATH, so in PowerShell run it as: & '$($esUser.FullName)' doctor)" -ForegroundColor Green }
else { Write-Host 'Tip: for music analysis, install earshot:  pip install "earshot[listen] @ git+https://github.com/Leonxlnx/earshot"  (about 2 GB with its listening models)' -ForegroundColor Yellow }
$wsUser = Get-ChildItem "$env:APPDATA\Python\Python*\Scripts\whisper.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ((Get-Command whisper -ErrorAction SilentlyContinue) -or $wsUser) { Write-Host 'OK  Whisper found: reels without captions get a transcript' -ForegroundColor Green }
else { Write-Host 'Tip: for scripts of reels without captions, install Whisper:  pip install openai-whisper' -ForegroundColor Yellow }

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
