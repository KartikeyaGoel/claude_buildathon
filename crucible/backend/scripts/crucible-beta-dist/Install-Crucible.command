#!/bin/bash
# Crucible beta — Control-click → Open the first time (Gatekeeper).
cd "$(dirname "$0")" || exit 1

# === Operator: replace with your Cloud Run URLs before zipping ===
export CRUCIBLE_API_BASE="https://YOUR-CRUCIBLE-API-URL.run.app"
export CRUCIBLE_MCP_URL="https://YOUR-CRUCIBLE-MCP-URL.run.app/mcp"

python3 install_claude_desktop_mcp_remote.py
echo ""
read -r -p "Press Enter to close…"
