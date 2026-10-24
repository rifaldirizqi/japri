# Build installer Windows: dist\JapriSetup-<versi>.exe
# Dijalanin di Windows (lokal atau GitHub Actions). Butuh: Node.js 22.13+, Go, Inno Setup 6.
#   pwsh packaging/windows/build.ps1
$ErrorActionPreference = "Stop"
# Error apa pun dilaporin sebagai anotasi GitHub Actions biar kelihatan di ringkasan run
trap { Write-Host "::error::$_"; exit 1 }

# Jalanin perintah eksternal; kalau gagal, lempar error berisi beberapa baris terakhir output-nya
function Run([string]$What, [scriptblock]$Cmd) {
  $out = & $Cmd 2>&1 | ForEach-Object { "$_" }
  $out | Write-Host
  if ($LASTEXITCODE) { throw "$What gagal (exit $LASTEXITCODE): " + (($out | Select-Object -Last 8) -join " | ") }
}
$Root = Resolve-Path "$PSScriptRoot\..\.."
$Stage = "$Root\dist\windows"
Set-Location $Root

$Version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$NodeVersion = (node --version).Trim()   # node.exe yang dibundel = versi Node yang dipakai build
Write-Host "==> Build Japri $Version (Node $NodeVersion)"

Remove-Item -Recurse -Force "$Root\dist" -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$Stage\app", "$Stage\node" | Out-Null

# 1. Kode aplikasi + dependency produksi (binary esbuild buat Windows ikut ke-download di sini).
#    --omit=peer: buang sharp (~46 MB), cuma dipakai Baileys buat thumbnail media dan di-load opsional.
#    Catatan: ini ngehapus devDependencies dari node_modules lokal; jalanin `npm install` lagi kalau mau develop.
Write-Host "==> npm ci"
Run "npm ci" { npm ci --omit=dev --omit=peer --no-audit --no-fund }
Copy-Item -Recurse src, node_modules, package.json, LICENSE, README.md -Destination "$Stage\app"
# Pangkas file yang gak kepake waktu jalan
$nm = "$Stage\app\node_modules"
Get-ChildItem $nm -Recurse -Filter *.map -File | Remove-Item -Force

# 2. Node.js portable (cuma node.exe)
Write-Host "==> Download Node $NodeVersion"
$zip = "$env:RUNNER_TEMP\node.zip"
if (-not $env:RUNNER_TEMP) { $zip = "$env:TEMP\node.zip" }
Invoke-WebRequest "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip" -OutFile $zip
$extract = "$(Split-Path $zip)\node-extract"
Remove-Item -Recurse -Force $extract -ErrorAction SilentlyContinue
Expand-Archive $zip -DestinationPath $extract
Copy-Item "$extract\node-$NodeVersion-win-x64\node.exe" "$Stage\node\node.exe"
Copy-Item "$extract\node-$NodeVersion-win-x64\LICENSE" "$Stage\node\LICENSE"

# 3. Japri.exe (launcher) + ikon
Write-Host "==> Build Japri.exe"
Push-Location packaging\windows\launcher
Run "rsrc (ikon)" { go run github.com/akavel/rsrc@v0.10.2 -ico ..\japri.ico -arch amd64 -o rsrc_windows_amd64.syso }
$env:GOOS = "windows"; $env:GOARCH = "amd64"
Run "go build" { go build -ldflags "-s -w" -o "$Stage\Japri.exe" . }
Remove-Item rsrc_windows_amd64.syso
Pop-Location

# 4. Installer
Write-Host "==> Inno Setup"
$iscc = (Get-Command iscc -ErrorAction SilentlyContinue).Source
if (-not $iscc) { $iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" }
if (-not (Test-Path $iscc)) { throw "Inno Setup 6 gak ketemu. Install dari https://jrsoftware.org/isdl.php" }
Run "Inno Setup" { & $iscc "/DAppVersion=$Version" packaging\windows\japri.iss }

Write-Host "==> Selesai: dist\JapriSetup-$Version.exe"
