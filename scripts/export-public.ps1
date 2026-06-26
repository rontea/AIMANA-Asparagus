param(
  [Parameter(Mandatory = $true)]
  [string]$PublicRepoPath
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$privateRepo = Resolve-Path (Join-Path $scriptDir "..")

if (-not (Test-Path $PublicRepoPath)) {
  New-Item -ItemType Directory -Path $PublicRepoPath | Out-Null
}

$publicRepo = Resolve-Path $PublicRepoPath

if ($privateRepo.Path.TrimEnd("\") -eq $publicRepo.Path.TrimEnd("\")) {
  throw "PublicRepoPath must be a different folder from the private repo."
}

$privateGit = Join-Path $privateRepo ".git"
$publicGit = Join-Path $publicRepo ".git"

if (-not (Test-Path $privateGit)) {
  throw "Private repo .git folder was not found at $privateGit."
}

if (-not (Test-Path $publicGit)) {
  Write-Warning "No .git folder found in the public repo path. Clone or initialize the public repo there before publishing."
}

$excludedDirs = @(
  ".git",
  ".vscode",
  ".idea",
  "node_modules",
  "jspm_packages",
  "storage",
  "internal.docs",
  "internal.todo",
  "design-concept-1",
  "dist",
  "build",
  "coverage"
)

$excludedFiles = @(
  ".env",
  ".env.*",
  ".env.local",
  ".env.development.local",
  ".env.test.local",
  ".env.production.local",
  "private.README.md",
  "README.md",
  "tmp_*",
  "*.log",
  "*.bak",
  "*.backup",
  "*.db",
  "*.db-journal",
  "*.db-wal",
  "*.pem",
  "*.p12",
  "*.pfx",
  "*.key",
  "*.crt",
  "*credential*.json",
  "*credentials*.json",
  "*secret*.json",
  "*secrets*.json",
  "*token*.json",
  "*service-account*.json",
  "*.zip",
  "*.7z",
  "*.rar",
  "*.tar",
  "*.tgz",
  "*.gz",
  "*.timestamp-*.mjs"
)

$forbiddenPublicPaths = @(
  ".vscode",
  ".idea",
  "internal.docs",
  "internal.todo",
  "private.README.md",
  ".env",
  ".env.local",
  ".env.development.local",
  ".env.test.local",
  ".env.production.local",
  "storage",
  "node_modules",
  "jspm_packages",
  "dist",
  "build",
  "coverage",
  "design-concept-1"
)

$forbiddenPublicFilePatterns = @(
  ".env.*",
  "private.README.md",
  "tmp_*",
  "*.log",
  "*.bak",
  "*.backup",
  "*.db",
  "*.db-journal",
  "*.db-wal",
  "*.pem",
  "*.p12",
  "*.pfx",
  "*.key",
  "*.crt",
  "*credential*.json",
  "*credentials*.json",
  "*secret*.json",
  "*secrets*.json",
  "*token*.json",
  "*service-account*.json",
  "*.zip",
  "*.7z",
  "*.rar",
  "*.tar",
  "*.tgz",
  "*.gz",
  "*.timestamp-*.mjs"
)

Write-Host "Mirroring public-safe files..."
Write-Host "Private repo: $($privateRepo.Path)"
Write-Host "Public repo:  $($publicRepo.Path)"

$robocopyArgs = @(
  $privateRepo.Path,
  $publicRepo.Path,
  "/MIR",
  "/XD"
) + $excludedDirs + @(
  "/XF"
) + $excludedFiles + @(
  "/R:2",
  "/W:2",
  "/NFL",
  "/NDL"
)

& robocopy @robocopyArgs
$exitCode = $LASTEXITCODE

if ($exitCode -gt 7) {
  throw "Robocopy failed with exit code $exitCode."
}

$publicRoot = $publicRepo.Path.TrimEnd("\")

function Assert-InPublicRepo {
  param([string]$Path)

  if (-not ($Path -eq $publicRoot -or $Path.StartsWith("$publicRoot\"))) {
    throw "Refusing to remove path outside the public repo: $Path"
  }
}

foreach ($relativePath in $forbiddenPublicPaths) {
  $candidate = Join-Path $publicRepo.Path $relativePath

  if (-not (Test-Path -LiteralPath $candidate)) {
    continue
  }

  $resolvedCandidate = Resolve-Path -LiteralPath $candidate

  foreach ($resolvedPath in $resolvedCandidate) {
    $fullPath = $resolvedPath.Path

    Assert-InPublicRepo -Path $fullPath

    Write-Host "Removing forbidden public path: $relativePath"
    Remove-Item -LiteralPath $fullPath -Recurse -Force
  }
}

foreach ($pattern in $forbiddenPublicFilePatterns) {
  $matches = Get-ChildItem -Path (Join-Path $publicRepo.Path "*") -Recurse -Force -File -Include $pattern -ErrorAction SilentlyContinue

  foreach ($match in $matches) {
    $fullPath = $match.FullName

    if ($fullPath.StartsWith("$publicRoot\.git\")) {
      continue
    }

    Assert-InPublicRepo -Path $fullPath

    Write-Host "Removing forbidden public file: $($match.FullName.Substring($publicRoot.Length + 1))"
    Remove-Item -LiteralPath $fullPath -Force
  }
}

Write-Host ""
Write-Host "Export complete. Review the public repo before committing:"
Write-Host "  cd `"$($publicRepo.Path)`""
Write-Host "  git status"
