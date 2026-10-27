$ErrorActionPreference = 'Stop'
$campusRoot = Split-Path -Parent $PSScriptRoot
$campusNode = (Get-Command node -ErrorAction Stop).Source
Push-Location -LiteralPath $campusRoot
try {
    & $campusNode 'backend/app.js' --init
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la cuenta local.' }
    & $campusNode 'backend/app.js' --port 4173
} finally { Pop-Location }
