# Kerio Connect Integration - Setup & Documentation

## Übersicht

Der remote-mcp-server enthält eine vollständige Integration mit Kerio Connect Email Server über IMAP/SMTP. Die Integration ermöglicht es Claude AI, E-Mails zu lesen, zu senden und zu durchsuchen.

## Architektur

### Module
- **kerio-connector.js**: Haupt-Modul mit IMAP/SMTP Funktionen
- **remote-mcp-server-with-skills.js**: Integration in MCP Server

### Verfügbare Tools

1. **`kerio_list_emails`** 📧
   - Liste Emails aus einem Postfach
   - Unterstützt verschiedene Ordner (INBOX, Sent, etc.)
   - Filter für ungelesene Emails
   - Limit konfigurierbar

2. **`kerio_read_email`** 📖
   - Vollständigen Email-Inhalt lesen
   - Text und HTML Versionen
   - Anhänge-Informationen
   - Metadata (Von, An, CC, Datum)

3. **`kerio_send_email`** ✉️
   - Emails versenden via SMTP
   - Unterstützt CC und BCC
   - Text und HTML Format
   - Von Adresse = Kerio Username

4. **`kerio_search_emails`** 🔍
   - Durchsuche Emails nach Stichwort
   - Sucht in Subject und Body
   - Konfigurierbares Limit
   - Unterstützt verschiedene Ordner

## Environment Variables (für DigitalOcean)

### Erforderliche Variablen

```bash
# Kerio Server Host (Domain oder IP)
KERIO_HOST=mail.your-domain.com

# Kerio Login Credentials
KERIO_USERNAME=your-email@your-domain.com
KERIO_PASSWORD=your-password

# Optional: Ports (Standard-Werte werden verwendet wenn nicht gesetzt)
KERIO_IMAP_PORT=993
KERIO_SMTP_PORT=465

# Optional: SSL/TLS (Standard: true)
KERIO_USE_SSL=true
```

### DigitalOcean Setup

1. Gehen Sie zu Ihrer App: `remote-mcp-server` auf DigitalOcean
2. Navigieren Sie zu: **Settings** → **App-Level Environment Variables**
3. Fügen Sie die folgenden Variablen hinzu:

#### Minimum Configuration (Erforderlich):

| Variable | Wert | Beschreibung |
|----------|------|--------------|
| `KERIO_HOST` | `mail.your-domain.com` | Ihr Kerio Connect Server |
| `KERIO_USERNAME` | `user@domain.com` | Email Account |
| `KERIO_PASSWORD` | `*******` | Account Passwort |

#### Optionale Configuration:

| Variable | Standard-Wert | Beschreibung |
|----------|---------------|--------------|
| `KERIO_IMAP_PORT` | `993` | IMAP SSL Port |
| `KERIO_SMTP_PORT` | `465` | SMTP SSL Port |
| `KERIO_USE_SSL` | `true` | SSL/TLS aktivieren |

## Funktionsweise

### Auto-Detection

Der Server erkennt automatisch, ob Kerio konfiguriert ist:

```javascript
function isKerioConfigured() {
  return !!(KERIO_CONFIG.host &&
            KERIO_CONFIG.username &&
            KERIO_CONFIG.password);
}
```

### Tool Verfügbarkeit

- **Wenn NICHT konfiguriert**: Kerio Tools werden nicht angezeigt
- **Wenn konfiguriert**: 4 Kerio Tools erscheinen automatisch im `/tools` Endpoint

### Integration in MCP Server

```javascript
// Beim Server-Start
if (kerioConnector && kerioConnector.isKerioConfigured()) {
  tools.push(...kerioConnector.KERIO_TOOLS);
  console.log('✅ Kerio Connector loaded');
}

// Bei Tool-Ausführung
if (tool.startsWith('kerio_')) {
  switch(tool) {
    case 'kerio_list_emails':
      result = await kerioConnector.listEmails(parameters);
      break;
    // ... weitere cases
  }
}
```

## Verwendung

### Beispiel 1: Emails auflisten

**Claude Prompt:**
```
Liste die letzten 10 ungelesenen Emails aus meinem Postfach auf
```

**Tool Call:**
```json
{
  "tool": "kerio_list_emails",
  "parameters": {
    "limit": 10,
    "unreadOnly": true
  }
}
```

### Beispiel 2: Email lesen

**Claude Prompt:**
```
Zeige mir den Inhalt der Email mit ID 42
```

**Tool Call:**
```json
{
  "tool": "kerio_read_email",
  "parameters": {
    "emailId": 42
  }
}
```

### Beispiel 3: Email senden

**Claude Prompt:**
```
Sende eine Email an max@beispiel.com mit Betreff "Test" und Text "Hallo Welt"
```

**Tool Call:**
```json
{
  "tool": "kerio_send_email",
  "parameters": {
    "to": "max@beispiel.com",
    "subject": "Test",
    "text": "Hallo Welt"
  }
}
```

### Beispiel 4: Emails durchsuchen

**Claude Prompt:**
```
Suche nach Emails mit dem Wort "Rechnung"
```

**Tool Call:**
```json
{
  "tool": "kerio_search_emails",
  "parameters": {
    "query": "Rechnung"
  }
}
```

## Security Considerations

### Passwort Sicherheit

- ⚠️ **NIEMALS** Passwörter in Code oder Git committen!
- ✅ Nur über DigitalOcean Environment Variables
- ✅ Environment Variables sind verschlüsselt und sicher

### SSL/TLS

- ✅ Standard: SSL aktiviert für IMAP (Port 993) und SMTP (Port 465)
- ✅ Self-signed certificates werden akzeptiert (`rejectUnauthorized: false`)
- ℹ️ Für Production: Verwenden Sie valide SSL-Zertifikate

### Zugriffskontrolle

- Der Server nutzt die angegebenen Credentials für ALLE Email-Operationen
- Empfehlung: Verwenden Sie einen dedizierten Email-Account für die Integration
- Setzen Sie geeignete Berechtigungen im Kerio Server

## Testing

### Schritt 1: Environment Variables setzen

Fügen Sie die Variablen in DigitalOcean hinzu (siehe oben)

### Schritt 2: Server neu starten

Force Rebuild der remote-mcp-server App

### Schritt 3: Tools überprüfen

```bash
curl https://mcp-bus-suyns.ondigitalocean.app/tools
```

Sie sollten 4 Kerio Tools sehen:
- `kerio_list_emails`
- `kerio_read_email`
- `kerio_send_email`
- `kerio_search_emails`

### Schritt 4: Test mit Claude

```
Zeige mir meine letzten 5 Emails
```

Claude sollte automatisch das `kerio_list_emails` Tool verwenden.

## Troubleshooting

### Problem: "Kerio Connect not configured"

**Lösung:**
- Überprüfen Sie, ob alle 3 erforderlichen Environment Variables gesetzt sind
- Server neu starten (Force Rebuild)

### Problem: "IMAP/SMTP connection failed"

**Ursachen:**
1. Falsches Passwort → Überprüfen Sie KERIO_PASSWORD
2. Falscher Host → Überprüfen Sie KERIO_HOST
3. Firewall blockiert → Ports 993 (IMAP) und 465 (SMTP) müssen offen sein
4. SSL-Problem → Versuchen Sie `KERIO_USE_SSL=false` (nur für Debugging!)

### Problem: Kerio Tools nicht sichtbar

**Lösung:**
1. Überprüfen Sie Server Logs in DigitalOcean
2. Suchen Sie nach: `✅ Kerio Connector loaded`
3. Wenn nicht vorhanden: Environment Variables fehlen

## Logs & Monitoring

### Server Startup

```
✅ Kerio Connector loaded
📋 /tools - Returning Router + Office + Kerio (12 tools)
```

### Tool Execution

```
🔧 Execute: kerio_list_emails
📧 Kerio: Listing emails from INBOX
✅ Kerio: Found 15 emails
```

## Technische Details

### IMAP Konfiguration

```javascript
{
  user: KERIO_CONFIG.username,
  password: KERIO_CONFIG.password,
  host: KERIO_CONFIG.host,
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
}
```

### SMTP Konfiguration

```javascript
{
  host: KERIO_CONFIG.host,
  port: 465,
  secure: true,
  auth: {
    user: KERIO_CONFIG.username,
    pass: KERIO_CONFIG.password
  }
}
```

### Dependencies

Im `package.json`:
```json
{
  "imap": "^0.8.19",
  "mailparser": "^3.6.5",
  "nodemailer": "^6.9.7"
}
```

## Status

- ✅ **Code**: Vollständig implementiert
- ✅ **Integration**: In remote-mcp-server integriert
- ⏳ **Configuration**: Environment Variables müssen gesetzt werden
- ⏳ **Testing**: Nach Configuration-Setup

## Next Steps

1. ✅ Environment Variables in DigitalOcean setzen
2. ✅ Force Rebuild der remote-mcp-server App
3. ✅ Testen mit Claude: "Zeige mir meine Emails"
4. ✅ Verifizieren, dass alle 4 Tools funktionieren

---

**Dokumentation erstellt:** 2025-10-29
**Version:** 1.0
**Autor:** AALS Software AG (mit Claude Code)
