@echo off
setlocal
cd /d "%~dp0"

REM === Operator: replace with your Cloud Run URLs before zipping ===
set "CRUCIBLE_API_BASE=https://YOUR-CRUCIBLE-API-URL.run.app"
set "CRUCIBLE_MCP_URL=https://YOUR-CRUCIBLE-MCP-URL.run.app/mcp"

set "LOG=%TEMP%\crucible-mcp-install.log"
py -3 install_claude_desktop_mcp_remote.py > "%LOG%" 2>&1
if errorlevel 1 python3 install_claude_desktop_mcp_remote.py > "%LOG%" 2>&1
if errorlevel 1 python install_claude_desktop_mcp_remote.py > "%LOG%" 2>&1
