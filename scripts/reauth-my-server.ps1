# Re-authenticate the my-server MCP server (non-interactive, bounded).
# - Skips if already authenticated (avoids opencode's interactive "re-auth?" prompt).
# - Hard 90s timeout on the opencode process — can't hang forever.
# Agent usage: bash "powershell -File scripts/reauth-my-server.ps1"

# opencode mcp auth list writes its formatted output to stderr; don't let
# $ErrorActionPreference='Stop' turn those stderr lines into terminating errors.
$ErrorActionPreference = 'Continue'

# 1. Pre-check: is my-server already authenticated?
$listOutput = & opencode mcp auth list 2>&1 | Out-String
$myServerLine = ($listOutput -split "`n" | Where-Object { $_ -match 'my-server' } | Select-Object -First 1)
if ($myServerLine -and $myServerLine -notmatch 'not authenticated') {
    Write-Output "already authenticated"
    exit 0
}

# 2. Launch opencode mcp auth with a hard timeout.
# Start-Process opens the browser (separate process); opencode waits for the OAuth callback.
# Use opencode.exe directly — Start-Process with the .ps1/.cmd shim opens Notepad on the .ps1
# (Windows default file association), which hangs until the user closes it.
$opencodeExe = "C:\Program Files\nodejs\node_modules\opencode-ai\bin\opencode.exe"
if (-not (Test-Path $opencodeExe)) {
    Write-Output "error - opencode.exe not found at $opencodeExe"
    exit 1
}
$proc = Start-Process -FilePath $opencodeExe -ArgumentList "mcp", "auth", "my-server" -PassThru
$proc | Wait-Process -Timeout 90

if (-not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Write-Output "timeout - killed after 90s"
    exit 1
}

Write-Output "done (exit $($proc.ExitCode))"
