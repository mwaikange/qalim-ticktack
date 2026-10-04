param([string]$Destination = 'C:\qalim-ticktack-main')
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$targetRoot = [System.IO.Path]::GetFullPath($Destination)
if ($targetRoot -eq $sourceRoot) { throw 'Source and destination must be different.' }
if (-not (Test-Path -LiteralPath $targetRoot -PathType Container)) { throw 'The destination folder must already exist.' }
$files = git -C $sourceRoot ls-files
if ($LASTEXITCODE -ne 0) { throw 'Could not list tracked project files. Stage new files before syncing.' }
$backupRoot = Join-Path $targetRoot ('.codex-sync-backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$copied = 0
$backedUp = 0
foreach ($file in $files) {
  $sourceFile = Join-Path $sourceRoot $file
  if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) { continue }
  $targetFile = Join-Path $targetRoot $file
  if (Test-Path -LiteralPath $targetFile -PathType Leaf) {
    if ((Get-FileHash -LiteralPath $sourceFile).Hash -eq (Get-FileHash -LiteralPath $targetFile).Hash) { continue }
    $backupFile = Join-Path $backupRoot $file
    New-Item -ItemType Directory -Path (Split-Path -Parent $backupFile) -Force | Out-Null
    Copy-Item -LiteralPath $targetFile -Destination $backupFile
    $backedUp++
  }
  New-Item -ItemType Directory -Path (Split-Path -Parent $targetFile) -Force | Out-Null
  Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
  $copied++
}
foreach ($file in $files) {
  $sourceFile = Join-Path $sourceRoot $file
  if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) { continue }
  $targetFile = Join-Path $targetRoot $file
  if ((Get-FileHash -LiteralPath $sourceFile).Hash -ne (Get-FileHash -LiteralPath $targetFile).Hash) { throw "Sync verification failed: $file" }
}
Write-Output "Synced and verified $copied changed files to $targetRoot. Preserved $backedUp previous versions in $backupRoot."
