#!/usr/bin/env python3
"""
Beta installer: register a Crucible user, merge mcp-remote bridge into Claude Desktop config.

Crucible production uses two URLs:
  - API base   → POST {api_base}/v1/users/register  (returns api_key)
  - MCP URL    → Streamable HTTP endpoint (e.g. {mcp_base}/mcp)

Requires: Python 3.9+ (stdlib only). Requires Node + npx for mcp-remote at runtime.

This file lives in crucible/backend/scripts/crucible-beta-dist/ — zip that whole folder for testers
(after setting URLs in run-installer-to-log.bat and Install-Crucible.command). See 00-OPERATOR-READ-FIRST.txt

Manual run:
  export CRUCIBLE_API_BASE=https://your-api.run.app
  export CRUCIBLE_MCP_URL=https://your-mcp.run.app/mcp
  python3 install_claude_desktop_mcp_remote.py

Claude Desktop expects local stdio; mcp-remote proxies to your HTTPS MCP and forwards headers.
See: https://www.npmjs.com/package/mcp-remote
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import urllib.error
import urllib.parse
import urllib.request


def claude_config_path() -> str:
    system = platform.system()
    if system == "Darwin":
        return os.path.expanduser("~/Library/Application Support/Claude/claude_desktop_config.json")
    if system == "Windows":
        appdata = os.environ.get("APPDATA")
        if not appdata:
            raise RuntimeError("APPDATA is not set; cannot locate Claude config on Windows")
        return os.path.join(appdata, "Claude", "claude_desktop_config.json")
    # Linux and others: common community path (not officially documented by Anthropic)
    return os.path.expanduser("~/.config/Claude/claude_desktop_config.json")


def register_user(api_base: str, plan_tier: str = "free") -> str:
    url = api_base.rstrip("/") + "/v1/users/register"
    body = json.dumps({"plan_tier": plan_tier}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Registration failed HTTP {e.code}: {detail}") from e

    api_key = data.get("api_key")
    if not api_key or not isinstance(api_key, str):
        raise RuntimeError(f"Unexpected register response (expected api_key): {data!r}")
    return api_key


def load_or_empty_config(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        try:
            raw = json.load(f)
        except json.JSONDecodeError:
            return {}
    return raw if isinstance(raw, dict) else {}


def chatgpt_connector_register_url(mcp_url: str) -> str:
    q = urllib.parse.quote(mcp_url, safe="")
    return f"https://chatgpt.com/connector/oauth/register?url={q}"


def print_post_install_banner(
    *,
    cfg_path: str | None,
    api_key: str,
    mcp_url: str,
    dry_run: bool = False,
) -> None:
    """Stdout: copy-paste friendly instructions for Claude + ChatGPT Plus."""
    chatgpt_link = chatgpt_connector_register_url(mcp_url)
    if dry_run:
        lines = [
            "",
            "Dry run: user registered; Claude Desktop config was not modified.",
            "",
        ]
    else:
        lines = [
            "",
            "🎉 Installation complete for Claude Desktop!",
            "",
        ]
    if cfg_path and not dry_run:
        lines.extend(
            [
                f"Claude config updated: {cfg_path}",
                "Restart Claude Desktop completely to load MCP.",
                "",
            ]
        )
    lines.extend(
        [
            "─" * 50,
            "Using ChatGPT Plus instead?",
            "",
            "1. Copy your unique Beta Token (same as your Crucible API key):",
            f"   {api_key}",
            "",
            "2. Open this link to add the connector:",
            f"   {chatgpt_link}",
            "",
            '3. When ChatGPT prompts for authentication, select "API Key" and paste your token.',
            "",
        ]
    )
    print("\n".join(lines))


def merge_mcp_server(config: dict, name: str, mcp_url: str, api_key: str) -> None:
    if "mcpServers" not in config or not isinstance(config["mcpServers"], dict):
        config["mcpServers"] = {}

    # mcp-remote default is http-first (Streamable HTTP then SSE); matches Crucible /mcp.
    args = [
        "-y",
        "mcp-remote@latest",
        mcp_url,
        "--header",
        "Authorization:${CRUCIBLE_MCP_AUTH_HEADER}",
    ]

    config["mcpServers"][name] = {
        "command": "npx",
        "args": args,
        "env": {
            "CRUCIBLE_MCP_AUTH_HEADER": f"Bearer {api_key}",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Install Crucible MCP via mcp-remote for Claude Desktop")
    parser.add_argument(
        "--api-base",
        default=os.environ.get("CRUCIBLE_API_BASE", "").rstrip("/"),
        help="Crucible API origin (e.g. https://crucible-api-xxx.run.app). Env: CRUCIBLE_API_BASE",
    )
    parser.add_argument(
        "--mcp-url",
        default=os.environ.get("CRUCIBLE_MCP_URL", "").strip(),
        help="Full MCP Streamable HTTP URL (e.g. https://crucible-mcp-xxx.run.app/mcp). Env: CRUCIBLE_MCP_URL",
    )
    parser.add_argument(
        "--name",
        default=os.environ.get("CRUCIBLE_MCP_SERVER_NAME", "crucible"),
        help="Key under mcpServers (default: crucible)",
    )
    parser.add_argument(
        "--plan-tier",
        default="free",
        choices=["free", "pro"],
        help="Passed to /v1/users/register",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print merged server JSON, then ChatGPT instructions; do not write Claude config",
    )
    args = parser.parse_args()

    if not args.api_base:
        print("Missing --api-base or CRUCIBLE_API_BASE", file=sys.stderr)
        return 1
    if not args.mcp_url:
        print("Missing --mcp-url or CRUCIBLE_MCP_URL", file=sys.stderr)
        return 1

    print("Registering user…", file=sys.stderr)
    api_key = register_user(args.api_base, plan_tier=args.plan_tier)

    cfg_path = claude_config_path()
    config = load_or_empty_config(cfg_path)
    merge_mcp_server(config, args.name, args.mcp_url, api_key)

    if args.dry_run:
        print(json.dumps(config.get("mcpServers", {}).get(args.name, {}), indent=2))
        print_post_install_banner(cfg_path=None, api_key=api_key, mcp_url=args.mcp_url, dry_run=True)
        return 0

    os.makedirs(os.path.dirname(cfg_path), exist_ok=True)
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
        f.write("\n")

    print_post_install_banner(cfg_path=cfg_path, api_key=api_key, mcp_url=args.mcp_url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
