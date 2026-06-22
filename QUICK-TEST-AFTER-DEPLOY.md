# Quick Test nach Deployment

## Voraussetzungen

**Environment Variables auf DigitalOcean müssen gesetzt sein:**

```env
KERIO_HOST=mail.aals.ch
KERIO_USERNAME=kae@aals.ch
KERIO_PASSWORD=********
KERIO_IMAP_PORT=993
KERIO_SMTP_PORT=465
KERIO_USE_SSL=true
```

## 1. Health Check (sofort testbar)

```bash
curl https://mcp-bus-suyns.ondigitalocean.app/health
```

**Erwartete Antwort:**
```json
{
  "status": "ok",
  "service": "Remote MCP Server with Skill-Routing",
  "version": "3.0"
}
```

## 2. Tools prüfen

```bash
curl https://mcp-bus-suyns.ondigitalocean.app/tools
```

**Erwartete Tools:**
- `kerio_list_emails`
- `kerio_read_email`
- `kerio_send_email` (mit neuen Parametern)
- `kerio_search_emails`
- `kerio_list_folders` (NEU!)

## 3. Ordner auflisten (NEU!)

```bash
curl -X POST https://mcp-bus-suyns.ondigitalocean.app/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "kerio_list_folders",
    "parameters": {}
  }'
```

**Erwartete Antwort:**
```json
{
  "success": true,
  "result": {
    "folders": [
      { "name": "INBOX", "delimiter": "/", "hasChildren": false },
      { "name": "Gesendet", "delimiter": "/", "hasChildren": false },
      { "name": "Entwürfe", "delimiter": "/", "hasChildren": false },
      ...
    ]
  }
}
```

**Wichtig:** Notiere den genauen Namen des Gesendet-Ordners! (z.B. "Gesendet", "Sent", "Sent Items")

## 4. Test-Mail senden

```bash
curl -X POST https://mcp-bus-suyns.ondigitalocean.app/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "kerio_send_email",
    "parameters": {
      "to": "kae@aals.ch",
      "subject": "Deployment Test - Kerio Sent-Folder Fix",
      "text": "Dies ist eine Test-Mail nach dem Deployment.\n\nGetestet wird:\n- SMTP Versand\n- Speichern im Gesendet-Ordner\n- Korrektes Sendedatum",
      "html": "<h2>Deployment Test</h2><p>Dies ist eine <strong>Test-Mail</strong> nach dem Deployment.</p><h3>Getestet wird:</h3><ul><li>SMTP Versand</li><li>Speichern im Gesendet-Ordner</li><li>Korrektes Sendedatum</li></ul>",
      "sentFolder": "Gesendet"
    }
  }'
```

**Erwartete Antwort:**
```json
{
  "success": true,
  "result": {
    "success": true,
    "messageId": "<abc123@mail.aals.ch>",
    "message": "Email sent successfully to kae@aals.ch",
    "savedToSent": true
  }
}
```

**Wichtig:** `savedToSent: true` bedeutet, dass Mail im Gesendet-Ordner gespeichert wurde!

## 5. Gesendet-Ordner prüfen

```bash
curl -X POST https://mcp-bus-suyns.ondigitalocean.app/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "kerio_list_emails",
    "parameters": {
      "folder": "Gesendet",
      "limit": 5
    }
  }'
```

**Was zu prüfen ist:**
- [ ] Test-Mail ist in der Liste
- [ ] Betreff ist korrekt: "Deployment Test - Kerio Sent-Folder Fix"
- [ ] Sendedatum ist aktuell (nicht in der Vergangenheit)
- [ ] Absender ist korrekt: kae@aals.ch

## 6. E-Mail im Postfach prüfen

**Webmail oder E-Mail-Client:**
1. Öffne https://mail.aals.ch (oder E-Mail-Client)
2. Login als kae@aals.ch
3. Gehe zu **INBOX** → Test-Mail sollte angekommen sein
4. Gehe zu **Gesendet** → Test-Mail sollte dort auch sein!

**Prüfen:**
- [ ] Mail ist im Posteingang
- [ ] Mail ist im Gesendet-Ordner
- [ ] Sendedatum ist korrekt
- [ ] HTML-Formatierung funktioniert

## 7. Lokaler Test (optional)

Falls Sie lokal testen möchten:

```bash
cd remote-mcp-server
node test-kerio-sent-folder.js
```

## Troubleshooting

### Problem: "Kerio Connect not configured"

**Prüfe Environment Variables auf DigitalOcean:**
1. Apps → remote-mcp-server
2. Settings → Environment Variables
3. Alle KERIO_* Variablen müssen gesetzt sein

### Problem: "IMAP connection timeout"

**Mögliche Ursachen:**
- Firewall blockiert ausgehende Verbindungen zu Port 993
- Falscher Hostname in KERIO_HOST
- Credentials falsch

**Lösung:** Prüfe DigitalOcean Logs:
```
Apps → remote-mcp-server → Logs → Runtime Logs
```

### Problem: Mail wird versendet, aber nicht gespeichert

**Check Logs:**
```
Apps → remote-mcp-server → Logs → Runtime Logs
```

Suche nach:
- `📧 Email sent via SMTP` → SMTP funktioniert ✅
- `⚠️  Failed to save to sent folder` → Problem beim Speichern ❌
- `✅ Found sent folder: Gesendet` → Ordner gefunden ✅

**Häufige Ursache:** Falscher Ordnername

**Lösung:** Verwende `kerio_list_folders` um den korrekten Namen zu finden

### Problem: "Could not find Sent folder"

**Lösung:**
1. Nutze `kerio_list_folders` um alle Ordner zu sehen
2. Finde den Gesendet-Ordner (kann "Sent", "Gesendet", "Sent Items" heißen)
3. Verwende den exakten Namen in `sentFolder` Parameter

## Success Checklist

Nach erfolgreichem Test:

- [ ] Health Check erfolgreich
- [ ] `kerio_list_folders` zeigt Ordner
- [ ] Test-Mail erfolgreich versendet (`savedToSent: true`)
- [ ] Mail ist im Posteingang (INBOX)
- [ ] Mail ist im Gesendet-Ordner
- [ ] Sendedatum ist korrekt
- [ ] Keine Fehler in DigitalOcean Logs

## Support

Falls Probleme auftreten:
1. **Logs prüfen**: DigitalOcean → Apps → Runtime Logs
2. **Environment Variables prüfen**: Sind alle KERIO_* Variablen gesetzt?
3. **Lokal testen**: `node test-kerio-sent-folder.js`
4. **Dokumentation**: Siehe `KERIO-SENT-FOLDER-FIX.md`

---

**Deployment Commit:** `dea7cd9`
**Version:** 2.0 (Kerio Sent-Folder Fix)
**Datum:** 2026-01-12
