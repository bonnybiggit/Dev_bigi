$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'LocalMongo.Common.ps1')
Invoke-LocalMongo -Action frontend
