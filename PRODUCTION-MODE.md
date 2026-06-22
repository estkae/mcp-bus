# Production Mode - Remote MCP Server

## Übersicht

Der Remote MCP Server unterstützt zwei Modi:

- **🧪 SIMULATION MODE** (Standard): Simuliert Tool-Ausführung ohne echte Datei-Erstellung
- **🏭 PRODUCTION MODE**: Erstellt echte PowerPoint- und Excel-Dateien

---

## 🚀 Aktivierung des Produktionsmodus

### Methode 1: DigitalOcean Environment Variable (Empfohlen)

1. Öffnen Sie: https://cloud.digitalocean.com/apps
2. Wählen Sie Ihre App: `mcp-bus-suyns`
3. Navigieren Sie zu: **Settings** → **App-Level Environment Variables**
4. Fügen Sie hinzu:
   ```
   Name:  NODE_ENV
   Value: production
   ```
5. Klicken Sie auf **Save**
6. Die App wird automatisch neu deployed

### Methode 2: Procfile (Bereits konfiguriert)

Der [Procfile](Procfile) wurde bereits aktualisiert:

```
web: NODE_ENV=production node remote-mcp-server-with-skills.js
```

Beim nächsten Deployment wird der Server automatisch im Produktionsmodus starten.

### Methode 3: Lokal testen

```bash
# Simulation Mode (Standard)
npm start

# Production Mode
NODE_ENV=production npm start

# Oder direkt:
NODE_ENV=production node remote-mcp-server-with-skills.js
```

---

## 📋 Implementierte Production-Features

### ✅ PowerPoint-Erstellung (create_powerpoint)

**Status:** ✅ **Vollständig implementiert**

**Bibliothek:** `pptxgenjs` v3.12.0

**Features:**
- Automatische Titelfolie mit Branding
- Content-Folien mit Bullet-Points
- Foliennummerierung
- Professionelles Design
- Datei-Export als .pptx

**Beispiel-Aufruf:**
```json
{
  "tool": "create_powerpoint",
  "parameters": {
    "title": "Q1 Geschäftsbericht 2025",
    "filename": "q1-report.pptx",
    "slides": [
      {
        "title": "Umsatzentwicklung",
        "content": [
          "Umsatz: +15% YoY",
          "Neue Kunden: 342",
          "Marktanteil: 23%"
        ]
      },
      {
        "title": "Ausblick Q2",
        "content": [
          "Expansion nach Europa",
          "Neue Produktlinie",
          "Team-Erweiterung"
        ]
      }
    ]
  }
}
```

**Output:**
```json
{
  "success": true,
  "mode": "PRODUCTION",
  "tool": "create_powerpoint",
  "filename": "q1-report.pptx",
  "path": "/app/output/q1-report.pptx",
  "slides_count": 3,
  "file_size": 42158,
  "message": "PowerPoint-Präsentation 'Q1 Geschäftsbericht 2025' erfolgreich erstellt",
  "timestamp": "2025-10-27T13:45:00.000Z"
}
```

---

### ✅ Excel-Erstellung (create_excel)

**Status:** ✅ **Vollständig implementiert**

**Bibliothek:** `exceljs` v4.3.0

**Features:**
- Mehrere Sheets pro Workbook
- Automatische Spaltenbreite
- Header-Formatierung (fett, grauer Hintergrund)
- Datei-Export als .xlsx

**Beispiel-Aufruf:**
```json
{
  "tool": "create_excel",
  "parameters": {
    "filename": "sales-data.xlsx",
    "sheets": [
      {
        "name": "Q1 Sales",
        "data": [
          ["Produkt", "Umsatz", "Menge"],
          ["Product A", 15000, 150],
          ["Product B", 23000, 230],
          ["Product C", 18500, 185]
        ]
      },
      {
        "name": "Q2 Sales",
        "data": [
          ["Produkt", "Umsatz", "Menge"],
          ["Product A", 18000, 180],
          ["Product B", 25000, 250]
        ]
      }
    ]
  }
}
```

**Output:**
```json
{
  "success": true,
  "mode": "PRODUCTION",
  "tool": "create_excel",
  "filename": "sales-data.xlsx",
  "path": "/app/output/sales-data.xlsx",
  "sheets_count": 2,
  "file_size": 8432,
  "message": "Excel-Datei 'sales-data.xlsx' erfolgreich erstellt",
  "timestamp": "2025-10-27T13:45:00.000Z"
}
```

---

### ⏳ Weitere Tools (Placeholder)

Die folgenden Tools sind als **Production Placeholder** implementiert:

- 🔄 **read_pdf** - PDF-Lesen (TODO: pdf-parse Integration)
- 🔄 **apply_brand_guidelines** - Brand-Richtlinien
- 🔄 **review_code** - Code-Review (TODO: ESLint/Pylint)
- 🔄 **write_blog_post** - Blog-Generierung

Diese können bei Bedarf erweitert werden.

---

## 🎯 Unterschiede: Simulation vs. Production

### Simulation Mode (NODE_ENV=development)

**Response:**
```json
{
  "success": true,
  "mode": "SIMULATION",
  "tool": "create_powerpoint",
  "message": "✅ Tool 'create_powerpoint' im Simulationsmodus",
  "note": "Dies ist eine Simulation. Setzen Sie NODE_ENV=production für echte Ausführung.",
  "timestamp": "..."
}
```

**Merkmale:**
- ❌ Keine echten Dateien erstellt
- ✅ Schnelle Response
- ✅ Ideal für Entwicklung/Testing
- ✅ Kein Filesystem-Zugriff nötig

### Production Mode (NODE_ENV=production)

**Response:**
```json
{
  "success": true,
  "mode": "PRODUCTION",
  "tool": "create_powerpoint",
  "filename": "presentation.pptx",
  "path": "/app/output/presentation.pptx",
  "slides_count": 5,
  "file_size": 42158,
  "message": "PowerPoint-Präsentation erfolgreich erstellt",
  "timestamp": "..."
}
```

**Merkmale:**
- ✅ Echte Dateien im `/output` Verzeichnis
- ✅ Download-Links verfügbar
- ✅ Produktionsreife Qualität
- ⚠️  Benötigt Filesystem-Zugriff

---

## 📁 Output-Verzeichnis

### Lokale Entwicklung

Dateien werden gespeichert in:
```
/remote-mcp-server/output/
├── presentation_2025-10-27T13-45-00.pptx
├── sales-data_2025-10-27T14-23-15.xlsx
└── ...
```

### DigitalOcean Production

Dateien werden gespeichert in:
```
/app/output/
├── presentation.pptx
├── sales-data.xlsx
└── ...
```

**Hinweis:** DigitalOcean App Platform verwendet **ephemere Storage**. Dateien gehen bei Restart verloren!

### 💡 Persistente Storage-Optionen

Für dauerhafte Speicherung empfehlen wir:

1. **DigitalOcean Spaces** (S3-kompatibel)
   ```javascript
   // TODO: Implementierung mit aws-sdk
   ```

2. **Externe File-Server** (FTP/SFTP)
   ```javascript
   // TODO: Implementierung mit ssh2-sftp-client
   ```

3. **Database BLOBs** (für kleinere Dateien)
   ```javascript
   // TODO: MongoDB GridFS oder PostgreSQL Large Objects
   ```

---

## 🧪 Testing

### 1. Lokaler Test (Simulation Mode)

```bash
cd remote-mcp-server
npm install
npm start
```

**Test mit curl:**
```bash
curl -X POST http://localhost:8080/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "create_powerpoint",
    "parameters": {
      "title": "Test",
      "slides": [{"title": "Slide 1", "content": ["Point 1"]}]
    }
  }'
```

**Erwartete Response:**
```json
{
  "success": true,
  "result": {
    "mode": "SIMULATION",
    "message": "✅ Tool 'create_powerpoint' im Simulationsmodus",
    "note": "Dies ist eine Simulation..."
  }
}
```

### 2. Lokaler Test (Production Mode)

```bash
NODE_ENV=production npm start
```

**Test mit curl:**
```bash
curl -X POST http://localhost:8080/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "create_powerpoint",
    "parameters": {
      "title": "Test Production",
      "filename": "test.pptx",
      "slides": [{"title": "Slide 1", "content": ["Point 1", "Point 2"]}]
    }
  }'
```

**Erwartete Response:**
```json
{
  "success": true,
  "result": {
    "mode": "PRODUCTION",
    "filename": "test.pptx",
    "path": ".../output/test.pptx",
    "slides_count": 2,
    "file_size": 38429,
    "message": "PowerPoint-Präsentation 'Test Production' erfolgreich erstellt"
  }
}
```

**Datei prüfen:**
```bash
ls -lh output/test.pptx
# Output: -rw-r--r-- 1 user user 37K Oct 27 13:45 output/test.pptx
```

---

## 📊 Monitoring & Logging

### Server-Logs

**Production Mode aktiv:**
```
╔════════════════════════════════════════════════╗
║   🎯 Remote MCP Server with Skill-Routing     ║
╠════════════════════════════════════════════════╣
║  🔧 Environment: production                    ║
║  🏭 Production Mode: ENABLED ✅                ║
║  🚀 Server läuft auf Port 8080                 ║
║  📊 Skills geladen: 6                          ║
║  💰 Token-Einsparung: ~90%                     ║
║  🌐 DigitalOcean App Platform                  ║
╚════════════════════════════════════════════════╝

✅ Kerio Connector loaded
✅ Production Tools loaded
✅ 6 Skills geladen
✅ Server bereit!
```

**Simulation Mode aktiv:**
```
🔧 Environment: development
🏭 Production Mode: DISABLED (Simulation) ⚠️
⚠️  Production Tools not available: ...
```

### Health Check

```bash
curl http://localhost:8080/health
```

**Response:**
```json
{
  "status": "ok",
  "service": "Remote MCP Server with Skill-Routing",
  "version": "2.1.0",
  "mode": "production",
  "skills_loaded": 6,
  "production_tools": "enabled",
  "token_optimization": "enabled",
  "timestamp": "2025-10-27T13:45:00.000Z"
}
```

---

## 🔐 Sicherheit

### Environment Variables

Speichern Sie sensible Daten in Environment Variables:

```bash
# .env (NUR lokal, NICHT committen!)
NODE_ENV=production
OUTPUT_DIR=/app/output

# Optional: Kerio Connect
KERIO_HOST=mail.example.com
KERIO_USERNAME=user@example.com
KERIO_PASSWORD=xxxxx
```

### File Access Control

Production-Tools erstellen Dateien nur in:
- `process.env.OUTPUT_DIR` (falls gesetzt)
- `./output/` (Standard)

Zugriff außerhalb dieser Verzeichnisse ist blockiert.

---

## 🚀 Deployment-Checkliste

- [x] **Dependencies installiert** (`npm install`)
- [x] **package.json** aktualisiert (pptxgenjs, exceljs)
- [x] **production-tools.js** implementiert
- [x] **remote-mcp-server-with-skills.js** erweitert
- [x] **Procfile** aktualisiert (`NODE_ENV=production`)
- [x] **Environment Variable** gesetzt auf DigitalOcean
- [ ] **Output-Storage** konfiguriert (optional: S3/Spaces)
- [ ] **Download-Endpoint** implementiert (optional)
- [ ] **Tests** durchgeführt

---

## 📞 Support

Bei Problemen oder Fragen:

1. **Logs prüfen:**
   ```bash
   doctl apps logs <app-id> --tail
   ```

2. **Health Check:**
   ```bash
   curl https://mcp-bus-suyns.ondigitalocean.app/health
   ```

3. **Issues:** https://github.com/aals-software/remote-mcp-server/issues

---

## 📚 Weitere Dokumentation

- [README-SKILL-ROUTER.md](README-SKILL-ROUTER.md) - Vollständige Skill-Routing-Dokumentation
- [DEPLOYMENT-STEPS.md](DEPLOYMENT-STEPS.md) - Schritt-für-Schritt Deployment-Guide
- [skill-definitions.json](skills/skill-definitions.json) - Skill-Schema

---

**Version:** 2.1.0
**Letzte Aktualisierung:** 2025-10-27
**Autor:** AALS Software AG