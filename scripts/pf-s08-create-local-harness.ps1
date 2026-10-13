param(
    [string]$Destination = (Join-Path $env:TEMP ('pf-s08-supabase-' + [guid]::NewGuid().ToString('N')))
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$source = Join-Path $repo 'supabase'
if (Test-Path -LiteralPath $Destination) {
    throw "Harness destination already exists: $Destination"
}

$migrationDestination = Join-Path $Destination 'supabase/migrations'
New-Item -ItemType Directory -Path $migrationDestination -Force | Out-Null

$config = Get-Content -LiteralPath (Join-Path $source 'config.toml') -Raw
$config = $config.Replace('project_id = "personal-finance"', 'project_id = "personal-finance-pf-s08-harness"')
foreach ($pair in @(
    @('54320', '55420'), @('54321', '55421'), @('54322', '55422'),
    @('54323', '55423'), @('54324', '55424'), @('54325', '55425'),
    @('54326', '55426'), @('54327', '55427'), @('54329', '55429'),
    @('8083', '18083')
)) {
    $config = $config.Replace($pair[0], $pair[1])
}
[System.IO.File]::WriteAllText(
    (Join-Path $Destination 'supabase/config.toml'),
    $config,
    [System.Text.UTF8Encoding]::new($false)
)
Copy-Item -LiteralPath (Join-Path $source 'seed.sql') -Destination (Join-Path $Destination 'supabase/seed.sql')

# The historical migrations and owner-expand migration run first. Enforce is
# deliberately absent until explicit fixture mapping and preflight succeed.
$migrations = Get-ChildItem -LiteralPath (Join-Path $source 'migrations') -File -Filter '*.sql' |
    Where-Object { $_.Name -lt '20261009090000_pf_s08_owner_enforce.sql' } |
    Sort-Object Name
foreach ($migration in $migrations) {
    Copy-Item -LiteralPath $migration.FullName -Destination (Join-Path $migrationDestination $migration.Name)
}
if (-not (Test-Path -LiteralPath (Join-Path $migrationDestination '20261009080000_pf_s08_owner_expand.sql'))) {
    throw 'Owner-expand migration was not copied.'
}
Write-Output $Destination
