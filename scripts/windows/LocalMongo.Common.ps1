function Invoke-LocalMongo {
    param([Parameter(Mandatory = $true)][string]$Action, [string]$Argument)
    $ErrorActionPreference = 'Stop'
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Missing prerequisite: Node.js 20.19+ or 22.12+. No installation or system changes attempted.'
    }
    $projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
    foreach ($dependency in @('mongoose', 'dotenv')) {
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules/$dependency/package.json"))) {
            throw "Missing prerequisite: installed project dependency $dependency. Install project dependencies separately; this script does not install anything."
        }
    }
    $manager = Join-Path $projectRoot 'scripts/local-mongo/manage.js'
    if ($Argument) { & node $manager $Action $Argument } else { & node $manager $Action }
    if ($LASTEXITCODE -ne 0) { throw "Isolated local command '$Action' failed; see the prerequisite/safety message above." }
}
