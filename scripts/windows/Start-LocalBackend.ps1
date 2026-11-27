[CmdletBinding()]
param([ValidateSet('start', 'dev', 'seed')][string]$Mode = 'start')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'LocalMongo.Common.ps1')
Invoke-LocalMongo -Action backend -Argument $Mode
