$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspacePath 'backend'
$localPath = Join-Path $backendPath '.local'
$dataPath = Join-Path $localPath 'postgres'
if (-not ([IO.Path]::GetFullPath($dataPath)).StartsWith($workspacePath + [IO.Path]::DirectorySeparatorChar)) { throw 'Database directory must be inside this workspace.' }
$pgBinPath = 'C:\Program Files\PostgreSQL\17\bin'
if (-not (Test-Path -LiteralPath (Join-Path $pgBinPath 'initdb.exe'))) { throw 'PostgreSQL 17 tools are required. Alternatively use docker compose.' }
New-Item -ItemType Directory -Force -Path $localPath | Out-Null
$envPath = Join-Path $backendPath '.env'
if (-not (Test-Path -LiteralPath $envPath)) {
    function New-Secret { $bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Fill($bytes); return [Convert]::ToHexString($bytes).ToLowerInvariant() }
    $dbPassword = New-Secret
    $sessionSecret = New-Secret
    $otpSecret = New-Secret
    $photoSecret = New-Secret
    $seedPassword = 'Verysure-Dev-' + (New-Secret).Substring(0,16)
    $settings = @"
NODE_ENV=development
PORT=4000
HOST=0.0.0.0
DATABASE_URL=postgresql://verysure:$dbPassword@127.0.0.1:55432/verysure?schema=public
TEST_DATABASE_URL=postgresql://verysure:$dbPassword@127.0.0.1:55432/verysure_test?schema=public
CORS_ORIGINS=http://localhost:8081,http://localhost:8082,http://localhost:19006
PUBLIC_API_URL=http://localhost:4000
SESSION_SECRET=$sessionSecret
OTP_SECRET=$otpSecret
PHOTO_SIGNING_SECRET=$photoSecret
OTP_PROVIDER=demo
PAYMENT_PROVIDER=demo
ALLOW_DEMO_PAYMENTS=true
UPLOAD_DIR=./uploads
SEED_PASSWORD=$seedPassword
"@
    Set-Content -LiteralPath $envPath -Value $settings
    Set-Content -LiteralPath (Join-Path $localPath 'pg-password') -Value $dbPassword -NoNewline
}
$dbUrlLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
$dbUri = [Uri]($dbUrlLine.Substring('DATABASE_URL='.Length))
if ($dbUri.Host -ne '127.0.0.1' -or $dbUri.Port -ne 55432) { throw 'This helper only manages its dedicated local PostgreSQL cluster on 127.0.0.1:55432.' }
$env:PGPASSWORD = ($dbUri.UserInfo -split ':',2)[1]
if (-not (Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))) {
    & (Join-Path $pgBinPath 'initdb.exe') -D $dataPath -U verysure --auth=scram-sha-256 --pwfile (Join-Path $localPath 'pg-password') --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
}
& (Join-Path $pgBinPath 'pg_ctl.exe') status -D $dataPath *> $null
if ($LASTEXITCODE -ne 0) {
    & (Join-Path $pgBinPath 'pg_ctl.exe') start -D $dataPath -l (Join-Path $localPath 'postgres.log') -o '-p 55432 -h 127.0.0.1' -w
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed' }
}
foreach ($databaseName in @('verysure','verysure_test')) {
    $exists = & (Join-Path $pgBinPath 'psql.exe') -h 127.0.0.1 -p 55432 -U verysure -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$databaseName'"
    if ($exists -ne '1') {
        & (Join-Path $pgBinPath 'createdb.exe') -h 127.0.0.1 -p 55432 -U verysure $databaseName
        if ($LASTEXITCODE -ne 0) { throw "Could not create $databaseName" }
    }
}
Remove-Item Env:PGPASSWORD
Write-Output 'Dedicated Verysure PostgreSQL cluster is ready on 127.0.0.1:55432. Credentials are in backend/.env.'
