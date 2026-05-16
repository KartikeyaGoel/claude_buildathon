# Beta distribution after GCP deploy

Operator guide: ship **one zip** built from the self-contained folder **`crucible-beta-dist/`**.

Testers need **Python 3.9+** and **Node 18+** (Claude uses `npx mcp-remote` when MCP starts).

---

## 1. Get your Cloud Run URLs

| Role | Example |
|------|---------|
| **API base** (no path) | `https://crucible-api-xxxxx-uc.a.run.app` |
| **MCP URL** (must end with `/mcp`) | `https://crucible-mcp-xxxxx-uc.a.run.app/mcp` |

```bash
gcloud run services describe crucible-api --region=YOUR_REGION --format='value(status.url)'
gcloud run services describe crucible-mcp --region=YOUR_REGION --format='value(status.url)'
```

Optional: `curl "${API_URL}/v1/health"` and hit MCP without Bearer (expect 401) to confirm routes.

---

## 2. Fill in URLs (before zipping)

Open **`crucible/backend/scripts/crucible-beta-dist/`** and edit **both**:

- **`run-installer-to-log.bat`** — `CRUCIBLE_API_BASE` and `CRUCIBLE_MCP_URL`
- **`Install-Crucible.command`** — same two values

Do not commit real URLs if the repo is public (use placeholders until you cut a release zip privately).

---

## 3. Zip for testers (all you do)

1. Open **`crucible-beta-dist/`** in Finder / Explorer.
2. Select **every item inside** (all files — flat layout).
3. **Compress / Send to compressed folder** → e.g. `Crucible-Beta-Install.zip`
4. Email the zip or host it over HTTPS (email often strips `.vbs` — link + password may be easier).

**Layout (everything in one flat folder):**

```
crucible-beta-dist/
  00-OPERATOR-READ-FIRST.txt   ← you read first; testers can ignore
  README-WINDOWS.txt
  README-macOS.txt
  install_claude_desktop_mcp_remote.py
  Install-Crucible.command
  RunInstaller-hidden-log.vbs
  run-installer-to-log.bat
```

**macOS:** On your Mac, run once before zipping so the execute bit is preserved:

```bash
chmod +x crucible/backend/scripts/crucible-beta-dist/Install-Crucible.command
```

Then zip from Finder so testers get an executable `.command`.

---

## 4. Tester flows (summary)

| OS | Action |
|----|--------|
| **Windows** | Read `README-WINDOWS.txt` → double-click **`RunInstaller-hidden-log.vbs`** → Notepad shows token + ChatGPT link |
| **macOS** | Read `README-macOS.txt` → Control-click **`Install-Crucible.command`** → Open → Open |

Then **fully restart Claude Desktop**.

---

## 5. OS trust warnings (unsigned beta)

- **macOS Gatekeeper:** Control-click → **Open** the first time; `xattr -d com.apple.quarantine` if needed (see README-macOS).
- **Windows SmartScreen:** **More info** → **Run anyway**; or file **Properties → Unblock**.

Signing/notarization (paid) reduces friction later.

---

## 6. Security

The installer calls **`POST /v1/users/register`** on the API URL. If the zip leaks, anyone can mint users — consider invite-only, a registration secret, or rate limits for open enrollment.

---

## 7. Installer behavior reference

| Step | URL |
|------|-----|
| Register | `{CRUCIBLE_API_BASE}/v1/users/register` |
| MCP over HTTPS | `{CRUCIBLE_MCP_URL}` |

Claude Desktop uses **local `npx mcp-remote`** with **`Authorization: Bearer <api_key>`** to your MCP host.

See root **`README.md`** for Cloud Run architecture (`crucible-api` vs `crucible-mcp`).
