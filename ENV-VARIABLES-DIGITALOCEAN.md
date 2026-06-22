# Environment Variables für DigitalOcean

## Remote MCP Server - Erforderliche Environment Variables

### Kerio Connect Email Integration

| Variable Name | Typ | Erforderlich | Standard-Wert | Beispiel | Beschreibung |
|--------------|-----|--------------|---------------|----------|--------------|
| `KERIO_HOST` | String | ✅ Ja | - | `mail.aals.ch` | Kerio Connect Server Hostname oder IP |
| `KERIO_USERNAME` | String | ✅ Ja | - | `integration@aals.ch` | Email Account für IMAP/SMTP |
| `KERIO_PASSWORD` | String | ✅ Ja | - | `*******` | Passwort für Email Account |
| `KERIO_IMAP_PORT` | Number | ❌ Optional | `993` | `993` | IMAP SSL Port |
| `KERIO_SMTP_PORT` | Number | ❌ Optional | `465` | `465` | SMTP SSL Port |
| `KERIO_USE_SSL` | Boolean | ❌ Optional | `true` | `true` | SSL/TLS aktivieren |

### Office Tools

| Variable Name | Typ | Erforderlich | Standard-Wert | Beispiel | Beschreibung |
|--------------|-----|--------------|---------------|----------|--------------|
| `OUTPUT_DIR` | String | ❌ Optional | `./output` | `/tmp/office-files` | Verzeichnis für generierte Office-Dateien |

### Server Configuration

| Variable Name | Typ | Erforderlich | Standard-Wert | Beispiel | Beschreibung |
|--------------|-----|--------------|---------------|----------|--------------|
| `PORT` | Number | ❌ Optional | `8080` | `8080` | Server Port (DigitalOcean setzt automatisch) |
| `NODE_ENV` | String | ❌ Optional | `production` | `production` | Node.js Environment |

---

## Claude-Webapp - Erforderliche Environment Variables

### App Configuration

| Variable Name | Typ | Erforderlich | Standard-Wert | Beispiel | Beschreibung |
|--------------|-----|--------------|---------------|----------|--------------|
| `APP_URL` | String | ✅ Ja | - | `https://claud-webapp-c75xo.ondigitalocean.app` | Vollständige App-URL für PDF Download-Links |
| `PORT` | Number | ❌ Optional | `3000` | `3000` | Server Port (DigitalOcean setzt automatisch) |

### Anthropic API

| Variable Name | Typ | Erforderlich | Standard-Wert | Beispiel | Beschreibung |
|--------------|-----|--------------|---------------|----------|--------------|
| `ANTHROPIC_API_KEY` | String | ✅ Ja | - | `sk-ant-api03-...` | Claude API Key |

### MCP Server Integration

| Variable Name | Typ | Erforderlich | Standard-Wert | Beispiel | Beschreibung |
|--------------|-----|--------------|---------------|----------|--------------|
| `REMOTE_MCP_SERVER_URL` | String | ❌ Optional | - | `https://mcp-bus-suyns.ondigitalocean.app` | URL des Remote MCP Servers |

---

## Setup-Anleitung DigitalOcean

### Schritt 1: remote-mcp-server konfigurieren

1. Gehen Sie zu: https://cloud.digitalocean.com/apps
2. Wählen Sie: `remote-mcp-server`
3. Navigieren Sie zu: **Settings** → **App-Level Environment Variables**
4. Klicken Sie: **Edit**
5. Fügen Sie hinzu:

```
KERIO_HOST=mail.aals.ch
KERIO_USERNAME=integration@aals.ch
KERIO_PASSWORD=IhrSicheresPasswort123
```

6. Klicken Sie: **Save**
7. Die App wird automatisch neu deployed

### Schritt 2: Claude-Webapp konfigurieren

1. Gehen Sie zu: https://cloud.digitalocean.com/apps
2. Wählen Sie: `claude-webapp`
3. Navigieren Sie zu: **Settings** → **App-Level Environment Variables**
4. Klicken Sie: **Edit**
5. Fügen Sie hinzu:

```
APP_URL=https://claud-webapp-c75xo.ondigitalocean.app
ANTHROPIC_API_KEY=sk-ant-api03-...
```

6. Klicken Sie: **Save**
7. Die App wird automatisch neu deployed

---

## Verifizierung

### Remote MCP Server

Nach dem Deployment prüfen Sie:

```bash
curl https://mcp-bus-suyns.ondigitalocean.app/

# Sollte zeigen:
# "features": [
#   "6 Skills: PowerPoint, Excel, Brand, PDF, Code Review, Blog Writer",
#   "Kerio Connect Email Integration (IMAP/SMTP)"
# ]
```

Kerio Tools überprüfen:
```bash
curl https://mcp-bus-suyns.ondigitalocean.app/tools | grep kerio

# Sollte 4 Kerio Tools zeigen:
# kerio_list_emails
# kerio_read_email
# kerio_send_email
# kerio_search_emails
```

### Claude-Webapp

Nach dem Deployment testen:
```
Erstelle ein PDF-Dokument über Test
```

Download-Button sollte erscheinen mit URL wie:
```
https://claud-webapp-c75xo.ondigitalocean.app/download/abc123...
```

---

## Security Best Practices

### ⚠️ NIEMALS in Git committen:
- ❌ API Keys
- ❌ Passwörter
- ❌ Email Credentials
- ❌ Private Keys

### ✅ Immer verwenden:
- ✅ DigitalOcean Environment Variables
- ✅ Sichere Passwörter (min. 16 Zeichen)
- ✅ Dedizierte Email-Accounts für Integration
- ✅ Regelmäßige Passwort-Rotation

### Empfohlene Email Account Setup:
```
Email: integration@aals.ch
Zweck: Nur für MCP Server Integration
Berechtigungen: Nur notwendige Postfächer
Passwort: Stark & einzigartig
```

---

## Troubleshooting

### Problem: Environment Variable wird nicht erkannt

**Symptom:** Tool funktioniert nicht, obwohl Variable gesetzt ist

**Lösung:**
1. DigitalOcean Console → App Settings → Environment Variables
2. Überprüfen Sie Schreibweise (case-sensitive!)
3. Klicken Sie "Save" und warten Sie auf Rebuild
4. Überprüfen Sie Logs: "App Settings" → "Runtime Logs"

### Problem: App deployed nicht automatisch

**Lösung:**
1. Nach Änderung der Environment Variables
2. Warten Sie 2-3 Minuten
3. Wenn nichts passiert: Manueller Force Rebuild
   - App auswählen → Actions → Force Rebuild and Deploy

---

## Status Checklist

### Remote MCP Server
- [ ] `KERIO_HOST` gesetzt
- [ ] `KERIO_USERNAME` gesetzt
- [ ] `KERIO_PASSWORD` gesetzt
- [ ] App deployed
- [ ] Kerio Tools sichtbar im `/tools` endpoint

### Claude-Webapp
- [ ] `APP_URL` gesetzt
- [ ] `ANTHROPIC_API_KEY` gesetzt
- [ ] App deployed
- [ ] PDF Downloads funktionieren
- [ ] Download-Buttons erscheinen

---

**Dokumentation erstellt:** 2025-10-29
**Letzte Aktualisierung:** 2025-10-29
**Version:** 1.0
