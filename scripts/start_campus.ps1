$ErrorActionPreference = 'Stop'
$campusRoot = Split-Path -Parent $PSScriptRoot
$campusPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath $campusPython)) { $campusPython = (Get-Command python -ErrorAction Stop).Source }
Push-Location -LiteralPath $campusRoot
try {
    & $campusPython 'backend/app.py' --init
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la cuenta local.' }
    & $campusPython 'backend/app.py' --port 4173
} finally { Pop-Location }
