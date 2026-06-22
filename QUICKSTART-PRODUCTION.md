# 🚀 Quick Start: Produktionsmodus aktivieren

## Sofort loslegen (3 Schritte)

### Schritt 1: DigitalOcean Dashboard öffnen

Gehen Sie zu: https://cloud.digitalocean.com/apps

### Schritt 2: Environment Variable setzen

1. Klicken Sie auf Ihre App: **mcp-bus-suyns**
2. Navigieren Sie zu: **Settings** → **App-Level Environment Variables**
3. Klicken Sie auf **Edit**
4. Fügen Sie hinzu:

```
Variable: NODE_ENV
Value:    production
```

5. Klicken Sie auf **Save**

### Schritt 3: Deployment abwarten

Die App wird automatisch neu deployed. Warten Sie ca. 2-3 Minuten.

---

## ✅ Überprüfung

Testen Sie, ob Production Mode aktiv ist:

```bash
curl https://mcp-bus-suyns.ondigitalocean.app/health
```

**Erwartete Response:**
```json
{
  "status": "ok",
  "mode": "production",
  "production_tools": "enabled",
  ...
}
```

---

## 🎯 Erste PowerPoint erstellen

```bash
curl -X POST https://mcp-bus-suyns.ondigitalocean.app/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "create_powerpoint",
    "parameters": {
      "title": "Meine erste Produktions-Präsentation",
      "filename": "erste-praesentation.pptx",
      "slides": [
        {
          "title": "Willkommen",
          "content": [
            "Dies ist eine echte PowerPoint-Datei",
            "Erstellt im Produktionsmodus",
            "Powered by AALS MCP Server"
          ]
        }
      ]
    }
  }'
```

**Erfolgreiche Response:**
```json
{
  "success": true,
  "result": {
    "mode": "PRODUCTION",
    "filename": "erste-praesentation.pptx",
    "path": "/app/output/erste-praesentation.pptx",
    "slides_count": 2,
    "file_size": 38429,
    "message": "PowerPoint-Präsentation 'Meine erste Produktions-Präsentation' erfolgreich erstellt"
  }
}
```

---

## 🎉 Fertig!

Ihr Remote MCP Server läuft jetzt im **Produktionsmodus** und erstellt echte PowerPoint- und Excel-Dateien!

---

## 📚 Nächste Schritte

- [PRODUCTION-MODE.md](PRODUCTION-MODE.md) - Vollständige Dokumentation
- [README-SKILL-ROUTER.md](README-SKILL-ROUTER.md) - Skill-Routing Details
- Implementieren Sie Download-Endpoints für Dateien
- Konfigurieren Sie persistente Storage (S3/Spaces)

---

**Bei Problemen?** Siehe [PRODUCTION-MODE.md](PRODUCTION-MODE.md) → Support-Sektion