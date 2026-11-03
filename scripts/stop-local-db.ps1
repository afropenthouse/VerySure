$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$dataPath = [IO.Path]::GetFullPath((Join-Path $workspacePath 'backend/.local/postgres'))
if (-not $dataPath.StartsWith($workspacePath + [IO.Path]::DirectorySeparatorChar)) { throw 'Database path must be inside the workspace.' }
& 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe' stop -D $dataPath -m fast -w
