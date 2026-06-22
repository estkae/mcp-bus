# Skills-Übersicht - Remote MCP Server

## 📊 Alle verfügbaren Skills

Der Remote MCP Server unterstützt derzeit **7 Skills** mit **9 Tools**:

---

## 1. 📊 PowerPoint Skill

**Status:** ✅ **Vollständig implementiert (Production-ready)**

**ID:** `powerpoint`

**Keywords:** powerpoint, präsentation, slides, folien, pptx, presentation

### Tools:

#### `create_powerpoint`
Erstellt professionelle PowerPoint-Präsentationen.

**Parameter:**
- `title` (string, required): Titel der Präsentation
- `slides` (array, required): Array von Folien
  - `title` (string): Folientitel
  - `content` (array): Bullet-Points als String-Array
- `filename` (string, optional): Dateiname

**Beispiel:**
```json
{
  "tool": "create_powerpoint",
  "parameters": {
    "title": "Quartalsbericht Q4 2024",
    "filename": "q4-report.pptx",
    "slides": [
      {
        "title": "Umsatzentwicklung",
        "content": [
          "Gesamtumsatz: 12,5 Mio. EUR (+18% YoY)",
          "Neue Kunden: 234",
          "Kundenzufriedenheit: 94%"
        ]
      },
      {
        "title": "Ausblick 2025",
        "content": [
          "Expansion nach Frankreich",
          "Neue Produktlinie 'Premium'",
          "Team-Wachstum: +25 Mitarbeiter"
        ]
      }
    ]
  }
}
```

**Features:**
- ✅ Automatische Titelfolie mit Branding
- ✅ Content-Folien mit Bullet-Points
- ✅ Foliennummerierung
- ✅ Professionelles Design
- ✅ PPTX-Export

---

## 2. 📈 Excel Skill

**Status:** ✅ **Vollständig implementiert (Production-ready)**

**ID:** `excel`

**Keywords:** excel, tabelle, spreadsheet, xlsx, daten, data

### Tools:

#### `create_excel`
Erstellt Excel-Tabellen mit mehreren Sheets.

**Parameter:**
- `filename` (string, required): Dateiname
- `sheets` (array, required): Array von Sheets
  - `name` (string): Sheet-Name
  - `data` (array): 2D-Array mit Daten

**Beispiel:**
```json
{
  "tool": "create_excel",
  "parameters": {
    "filename": "sales-2024.xlsx",
    "sheets": [
      {
        "name": "Q4 Sales",
        "data": [
          ["Produkt", "Verkäufe", "Umsatz", "Margin"],
          ["Product A", 1500, 75000, "25%"],
          ["Product B", 2300, 115000, "30%"],
          ["Product C", 1850, 92500, "28%"]
        ]
      },
      {
        "name": "Jahresübersicht",
        "data": [
          ["Quartal", "Umsatz", "Gewinn"],
          ["Q1", 250000, 50000],
          ["Q2", 280000, 58000],
          ["Q3", 265000, 55000],
          ["Q4", 320000, 68000]
        ]
      }
    ]
  }
}
```

**Features:**
- ✅ Multiple Sheets pro Workbook
- ✅ Automatische Spaltenbreite
- ✅ Header-Formatierung (fett, grauer Hintergrund)
- ✅ XLSX-Export

---

## 3. 📝 Word Skill

**Status:** ✅ **Vollständig implementiert (Production-ready)**

**ID:** `word`

**Keywords:** word, dokument, document, docx, text, brief, report

### Tools:

#### `create_word`
Erstellt professionelle Word-Dokumente.

**Parameter:**
- `title` (string, required): Titel des Dokuments
- `sections` (array, required): Array von Abschnitten
  - `heading` (string): Überschrift des Abschnitts
  - `content` (string): Textinhalt (Mehrzeilig mit \n)
  - `style` (string): 'normal', 'heading1', 'heading2', 'heading3'
- `filename` (string, optional): Dateiname

**Beispiel:**
```json
{
  "tool": "create_word",
  "parameters": {
    "title": "Projektbericht: Website-Relaunch",
    "filename": "projekt-bericht.docx",
    "sections": [
      {
        "heading": "Zusammenfassung",
        "content": "Das Projekt wurde erfolgreich innerhalb von 6 Monaten abgeschlossen.\n\nAlle Meilensteine wurden erreicht und das Budget wurde eingehalten.",
        "style": "heading1"
      },
      {
        "heading": "Technische Details",
        "content": "Verwendete Technologien:\n- React 18\n- Node.js 20\n- PostgreSQL 15\n\nDie neue Website ist 40% schneller als die alte Version.",
        "style": "heading2"
      },
      {
        "heading": "Nächste Schritte",
        "content": "1. SEO-Optimierung durchführen\n2. Analytics einrichten\n3. A/B-Testing starten",
        "style": "heading2"
      }
    ]
  }
}
```

**Features:**
- ✅ Mehrere Abschnitte mit Überschriften
- ✅ Styling (Heading 1-3, Normal)
- ✅ Automatische Formatierung
- ✅ Mehrzeiliger Text-Support
- ✅ DOCX-Export

---

## 4. 📄 PDF Skill

**Status:** ✅ **Vollständig implementiert (Production-ready)**

**ID:** `pdf`

**Keywords:** pdf, dokument, lesen, ocr

### Tools:

#### `read_pdf`
Liest und extrahiert Text aus PDF-Dateien.

**Parameter:**
- `filepath` (string, required): Pfad zur PDF-Datei

**Beispiel:**
```json
{
  "tool": "read_pdf",
  "parameters": {
    "filepath": "/app/uploads/contract-2024.pdf"
  }
}
```

**Response:**
```json
{
  "success": true,
  "tool": "read_pdf",
  "filepath": "/app/uploads/contract-2024.pdf",
  "num_pages": 12,
  "text_length": 8432,
  "text": "Extracted text from PDF...",
  "info": {
    "Title": "Vertrag 2024",
    "Author": "AALS Software AG"
  },
  "metadata": {},
  "message": "PDF erfolgreich gelesen: 12 Seiten"
}
```

**Features:**
- ✅ Text-Extraktion aus allen Seiten
- ✅ Metadaten-Auslese
- ✅ Seitenzahl-Information
- ✅ PDF-Info-Extraktion

---

## 5. 🎨 Brand Guidelines Skill

**Status:** 🔄 **Placeholder (noch nicht implementiert)**

**ID:** `brand-guidelines`

**Keywords:** brand, marke, corporate, branding, guidelines, richtlinien

### Tools:

#### `apply_brand_guidelines`
Wendet Marken-Richtlinien auf Inhalte an.

**Parameter:**
- `content` (string, required): Inhalt zum Anwenden
- `brand` (string, optional): Brand-ID (default: "default")

**Status:** Wartet auf Implementierung
- TODO: Brand-Style-Definitionen laden
- TODO: Content-Transformation durchführen
- TODO: CI/CD-konforme Ausgabe generieren

---

## 6. 🔍 Code Review Skill

**Status:** 🔄 **Placeholder (noch nicht implementiert)**

**ID:** `code-review`

**Keywords:** code, review, quality, bugs, security

### Tools:

#### `review_code`
Führt Code-Reviews auf Qualität und Security durch.

**Parameter:**
- `code` (string, required): Zu reviewender Code
- `language` (string, required): Programmiersprache

**Status:** Wartet auf Implementierung
- TODO: Linting-Tools integrieren (ESLint, Pylint)
- TODO: Security-Scan (npm audit, bandit)
- TODO: Code-Quality-Metriken
- TODO: Best-Practice-Checks

**Potenzielle Libraries:**
- ESLint (JavaScript/TypeScript)
- Pylint (Python)
- RuboCop (Ruby)
- CodeQL (Multi-Language Security)

---

## 7. ✍️ Blog Writer Skill

**Status:** 🔄 **Placeholder (noch nicht implementiert)**

**ID:** `blog-writer`

**Keywords:** blog, artikel, content, seo, writing

### Tools:

#### `write_blog_post`
Erstellt SEO-optimierte Blog-Artikel.

**Parameter:**
- `topic` (string, required): Thema des Blog-Posts
- `keywords` (array, optional): SEO-Keywords

**Status:** Wartet auf Implementierung
- TODO: Content-Generierung mit LLM
- TODO: SEO-Optimierung
- TODO: Keyword-Integration
- TODO: HTML/Markdown-Export

**Mögliche Integration:**
- OpenAI API für Content-Generierung
- SEO-Tools für Keyword-Analyse
- Markdown/HTML-Export

---

## 📊 Implementierungsstatus Übersicht

| Skill | ID | Status | Production-Ready | Tools |
|-------|-----|--------|------------------|-------|
| PowerPoint | `powerpoint` | ✅ Implementiert | Ja | 1 |
| Excel | `excel` | ✅ Implementiert | Ja | 1 |
| Word | `word` | ✅ Implementiert | Ja | 1 |
| PDF | `pdf` | ✅ Implementiert | Ja | 1 |
| Brand Guidelines | `brand-guidelines` | 🔄 Placeholder | Nein | 1 |
| Code Review | `code-review` | 🔄 Placeholder | Nein | 1 |
| Blog Writer | `blog-writer` | 🔄 Placeholder | Nein | 1 |

**Gesamt:** 7 Skills, 7 Tools (4 production-ready, 3 placeholders)

---

## 🚀 Verwendung

### Skill-Router verwenden

Der Skill-Router analysiert Ihre Anfrage automatisch und wählt die richtigen Skills:

```bash
curl -X POST https://mcp-bus-suyns.ondigitalocean.app/route \
  -H "Content-Type: application/json" \
  -d '{
    "user_request": "Erstelle mir eine PowerPoint über unser neues Produkt"
  }'
```

**Response:**
```json
{
  "success": true,
  "selected_skills": [
    {
      "id": "powerpoint",
      "name": "PowerPoint Skill",
      "tool_count": 1
    }
  ],
  "selection_reasoning": {
    "powerpoint": ["Keyword 'PowerPoint'"]
  },
  "tools": [...],
  "token_savings": {
    "without_routing": 890,
    "with_routing": 58,
    "savings_percentage": 93
  }
}
```

### Direktes Tool-Execution

```bash
curl -X POST https://mcp-bus-suyns.ondigitalocean.app/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "create_word",
    "parameters": {
      "title": "Test Document",
      "sections": [...]
    }
  }'
```

---

## 📦 Dependencies

**Production-Ready Skills:**

```json
{
  "pptxgenjs": "^3.12.0",   // PowerPoint
  "exceljs": "^4.3.0",       // Excel
  "docx": "^8.5.0",          // Word
  "pdf-parse": "^1.1.1"      // PDF
}
```

**Für zukünftige Skills:**
```json
{
  "eslint": "^8.x",          // Code Review
  "openai": "^4.x"           // Blog Writer (optional)
}
```

---

## 💡 Neue Skills hinzufügen

### 1. Skill-Definition erweitern

In [remote-mcp-server-with-skills.js:65-208](c:\Users\kae\OneDrive - AALS Software AG\locara\source\repos\remote-mcp-server\remote-mcp-server-with-skills.js#L65-L208):

```javascript
{
  id: "mein-skill",
  name: "Mein Skill",
  description: "Beschreibung",
  keywords: ["keyword1", "keyword2"],
  tools: [
    {
      name: "mein_tool",
      description: "Tool-Beschreibung",
      input_schema: { ... }
    }
  ]
}
```

### 2. Production-Implementation

In [production-tools.js](c:\Users\kae\OneDrive - AALS Software AG\locara\source\repos\remote-mcp-server\production-tools.js):

```javascript
async function meinTool(parameters) {
  // Implementation
  return {
    success: true,
    tool: 'mein_tool',
    ...
  };
}
```

### 3. Routing hinzufügen

```javascript
case 'mein_tool':
  result = await meinTool(parameters);
  break;
```

### 4. Export erweitern

```javascript
module.exports = {
  ...,
  meinTool
};
```

---

## 📚 Weitere Dokumentation

- [PRODUCTION-MODE.md](PRODUCTION-MODE.md) - Produktionsmodus aktivieren
- [QUICKSTART-PRODUCTION.md](QUICKSTART-PRODUCTION.md) - Quick-Start Guide
- [README-SKILL-ROUTER.md](README-SKILL-ROUTER.md) - Skill-Routing Details

---

**Version:** 2.2.0
**Letzte Aktualisierung:** 2025-10-27
**Autor:** AALS Software AG
