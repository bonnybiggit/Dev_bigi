[CmdletBinding()]
param([Parameter(Mandatory = $true)][ValidatePattern('^school_recovery_[a-f0-9]{24}$')][string]$Database)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Missing prerequisite: Node.js. Nothing was installed.' }
& node (Join-Path $PSScriptRoot '../../backend/src/scripts/runRecovered.js') $Database
if ($LASTEXITCODE -ne 0) { throw 'Verified local recovery backend failed to start.' }
