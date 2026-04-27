param(
  [Parameter(Mandatory = $true)]
  [string]$SearchRoot,

  [Parameter(Mandatory = $true)]
  [string]$Pattern,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force $outputDirectory | Out-Null

$asset = Get-ChildItem -Path $SearchRoot -File -Filter $Pattern -Recurse |
  Sort-Object FullName |
  Select-Object -First 1

if (-not $asset) {
  throw "No $Pattern found under $SearchRoot."
}

Copy-Item $asset.FullName $OutputPath
