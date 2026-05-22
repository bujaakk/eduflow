param(
  [string]$ProjectPath = (Get-Location).Path,
  [string]$Remote = 'origin',
  [string]$Branch = 'main',
  [int]$DebounceSeconds = 4
)

$ErrorActionPreference = 'Continue'

function Should-IgnorePath {
  param([string]$Path)

  $normalized = $Path.Replace('/', '\').ToLowerInvariant()
  return (
    $normalized.Contains('\\.git\\') -or
    $normalized.Contains('\\node_modules\\') -or
    $normalized.Contains('\\dist\\') -or
    $normalized.Contains('\\.firebase\\')
  )
}

function Invoke-Backup {
  param(
    [string]$RemoteName,
    [string]$BranchName
  )

  Push-Location $ProjectPath
  try {
    git rev-parse --is-inside-work-tree *> $null
    if ($LASTEXITCODE -ne 0) {
      Write-Host '[auto-backup] To nie jest repo git.' -ForegroundColor Red
      return
    }

    $status = git status --porcelain
    if (-not $status) {
      return
    }

    git add -A
    $statusAfterAdd = git status --porcelain
    if (-not $statusAfterAdd) {
      return
    }

    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $message = "backup: auto $timestamp"

    git commit -m $message *> $null
    if ($LASTEXITCODE -ne 0) {
      Write-Host '[auto-backup] Pomijam commit (prawdopodobnie brak zmian do commita).' -ForegroundColor Yellow
      return
    }

    git push $RemoteName $BranchName
    if ($LASTEXITCODE -eq 0) {
      Write-Host "[auto-backup] Zrobiono backup: $message" -ForegroundColor Green
    } else {
      Write-Host '[auto-backup] Commit zrobiony lokalnie, push nieudany.' -ForegroundColor Yellow
    }
  } finally {
    Pop-Location
  }
}

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $ProjectPath
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, DirectoryName, LastWrite, CreationTime'

$script:PendingBackup = $false
$script:LastEventAt = Get-Date

$eventAction = {
  $path = $Event.SourceEventArgs.FullPath
  if (Should-IgnorePath -Path $path) {
    return
  }

  $script:PendingBackup = $true
  $script:LastEventAt = Get-Date
}

Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $eventAction *> $null
Register-ObjectEvent -InputObject $watcher -EventName Created -Action $eventAction *> $null
Register-ObjectEvent -InputObject $watcher -EventName Deleted -Action $eventAction *> $null
Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action $eventAction *> $null

Write-Host '[auto-backup] Watching for changes...' -ForegroundColor Cyan
Write-Host "[auto-backup] Repo: $ProjectPath" -ForegroundColor Cyan
Write-Host "[auto-backup] Target: $Remote/$Branch" -ForegroundColor Cyan
Write-Host '[auto-backup] Stop with Ctrl+C' -ForegroundColor Cyan

try {
  while ($true) {
    if ($script:PendingBackup) {
      $elapsed = (Get-Date) - $script:LastEventAt
      if ($elapsed.TotalSeconds -ge $DebounceSeconds) {
        $script:PendingBackup = $false
        Invoke-Backup -RemoteName $Remote -BranchName $Branch
      }
    }

    Start-Sleep -Milliseconds 700
  }
} finally {
  Get-EventSubscriber | Unregister-Event
  $watcher.EnableRaisingEvents = $false
  $watcher.Dispose()
}
