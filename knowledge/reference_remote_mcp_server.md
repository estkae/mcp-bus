---
name: Remote MCP Server URL Pattern
description: Remote MCP Server Endpoints liegen am Root, nicht unter /mcp - REMOTE_MCP_SERVER_URL ohne Pfad-Suffix
type: reference
originSessionId: 6f93612f-cc5c-4e16-82d6-5ac4c36f21e1
---
# Remote MCP Server (DigitalOcean)

- URL: `https://mcp-bus-suyns.ondigitalocean.app`
- Repo: `estkae/remote-mcp-server` (DigitalOcean deployed)
- Version 2.1.0, 8 Skills geladen
- Liefert Office-Tools an pageindex-service + andere Apps

## Endpoints (am ROOT, NICHT unter /mcp)

| Endpoint | Zweck |
|---|---|
| `GET /` | Service-Info + Endpoint-Liste |
| `GET /health` | Health Check |
| `POST /execute` | Tool ausfuehren (`{tool, parameters}`) |
| `POST /route` | Skill Selection |
| `GET /tools` | Tool-Liste |
| `GET /skills` | Skills-Liste |
| `GET /download/:token` | Erstellte Datei laden (60min gueltig) |

## ENV-Variable

**Richtig:** `REMOTE_MCP_SERVER_URL=https://mcp-bus-suyns.ondigitalocean.app`

**Falsch (verursacht 404):** `REMOTE_MCP_SERVER_URL=https://mcp-bus-suyns.ondigitalocean.app/mcp`

Der Code macht `fetch(${REMOTE_MCP_SERVER_URL}/execute)` — mit /mcp-Suffix wird daraus
`.../mcp/execute` was nicht existiert, Server liefert 404 "Not Found".

## Office-Tool Payloads

```js
// Word: content kann string ODER Array sein
POST /execute { tool: "create_word", parameters: { title, content, filename? } }

// Excel: filename ist PFLICHT! Sheet = {name, headers, rows}
POST /execute { tool: "create_excel", parameters: { title, sheets: [{name,headers,rows}], filename } }

// PowerPoint: slides = [{title, content: []}]
POST /execute { tool: "create_powerpoint", parameters: { title, slides, filename? } }

// PDF: content string oder Array
POST /execute { tool: "create_pdf", parameters: { title, content, filename? } }
```

Response enthaelt `download_url` mit Token, 60 Minuten gueltig, Datei liegt fluechtig auf
DigitalOcean. Fuer Produktion: Tool-Output nach OneDrive/Tenant-Speicher umleiten.

## Hallucination-Falle

Wenn MCP-Call scheitert (404/500), zeigt Claude trotzdem Erfolgsmeldung ohne Download-Link.
Bei "erfolgreich erstellt" ohne Link -> immer Logs pruefen:
`ssh root@5.9.73.26 "docker logs pageindex-service --since 5m | grep -i 'Remote skill'"`
