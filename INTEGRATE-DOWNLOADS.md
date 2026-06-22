# Integration: Download-Links in remote-mcp-server-with-skills.js

## Schritt-für-Schritt Integration

### 1. File-Server importieren und aktivieren

Am Anfang von `remote-mcp-server-with-skills.js`:

```javascript
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// ✅ NEU: File-Server für Downloads
const { setupFileServer, startTokenCleanupJob } = require('./file-server');

// ✅ NEU: Office Tools mit Download-Links
const officeTools = require('./production-tools-office-with-downloads');

// File-Server aktivieren
setupFileServer(app);
startTokenCleanupJob(15);

console.log('✅ File-Server aktiviert mit Download-Links');
```

### 2. Office-Tools in /execute einbinden

In der `/execute` Route:

```javascript
app.post('/execute', async (req, res) => {
  const { tool, parameters } = req.body;

  console.log(`🔧 Execute: ${tool}`);

  try {
    let result;

    if (tool === 'skill_router') {
      const routeResult = selectSkills(parameters.user_request, parameters.context);
      result = routeResult;
    }
    else if (tool === 'list_all_skills') {
      result = formatAllSkillsList();
    }
    else if (tool === 'execute_skill_tool') {
      result = await executeSpecificSkillTool(parameters.tool_name, parameters.parameters);
    }
    // ✅ NEU: Office Tools mit Download-Links
    else if (['create_powerpoint', 'create_powerpoint_presentation'].includes(tool)) {
      result = await officeTools.createPowerPoint(parameters);
    }
    else if (['create_excel', 'create_excel_spreadsheet'].includes(tool)) {
      result = await officeTools.createExcel(parameters);
    }
    else if (['create_word', 'create_word_document'].includes(tool)) {
      result = await officeTools.createWord(parameters);
    }
    // Kerio Connect Tools
    else if (tool.startsWith('kerio_')) {
      if (!kerioConnector || !kerioConnector.isKerioConfigured()) {
        throw new Error('Kerio Connect not configured');
      }

      switch(tool) {
        case 'kerio_list_emails':
          result = await kerioConnector.listEmails(parameters || {});
          break;
        // ... andere Kerio Tools
      }
    }
    else {
      // Simuliere Tool-Ausführung (Fallback)
      result = await simulateToolExecution(tool, parameters);
    }

    res.json({ success: true, result });
  } catch (error) {
    console.error(`❌ Execute-Fehler:`, error);
    res.status(500).json({ error: error.message });
  }
});
```

### 3. Environment Variable sicherstellen

In der Start-Routine:

```javascript
// Server starten
async function startServer() {
  await loadSkillDefinitions();

  // ✅ NEU: SERVER_URL prüfen
  const serverUrl = process.env.SERVER_URL || `http://localhost:${PORT}`;
  process.env.SERVER_URL = serverUrl;

  console.log(`🌐 SERVER_URL: ${serverUrl}`);

  app.listen(PORT, () => {
    console.log(`🚀 Remote MCP Server läuft auf Port ${PORT}`);
    console.log(`📁 File-Server: ${serverUrl}/download/:token`);
    console.log(`📊 Skills: ${skillDefinitions?.skills.length || 0}`);
    console.log(`✅ Download-Links aktiviert`);
  });
}

startServer();
```

## Vollständige Integration (Code-Snippet)

Hier ist ein vollständiges Code-Snippet zum Einfügen:

```javascript
// ========================================
// FILE-SERVER & OFFICE TOOLS INTEGRATION
// ========================================

// Importiere File-Server
let fileServer = null;
let officeTools = null;

try {
  fileServer = require('./file-server');
  officeTools = require('./production-tools-office-with-downloads');

  console.log('✅ Office Tools mit Download-Links geladen');
} catch (error) {
  console.error('⚠️  Office Tools konnten nicht geladen werden:', error.message);
  console.error('   Fallback: Simulation-Modus');
}

// File-Server Setup (nach app.use(...))
if (fileServer) {
  fileServer.setupFileServer(app);
  fileServer.startTokenCleanupJob(15);
  console.log('📁 File-Server aktiviert');
}

// In /execute Route einfügen (vor dem Fallback):
if (officeTools) {
  if (['create_powerpoint', 'create_powerpoint_presentation'].includes(tool)) {
    result = await officeTools.createPowerPoint(parameters);
  }
  else if (['create_excel', 'create_excel_spreadsheet'].includes(tool)) {
    result = await officeTools.createExcel(parameters);
  }
  else if (['create_word', 'create_word_document'].includes(tool)) {
    result = await officeTools.createWord(parameters);
  }
}
```

## Test nach Integration

```bash
# Server starten
node remote-mcp-server-with-skills.js

# In anderem Terminal: Test
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

Erwartete Response:
```json
{
  "success": true,
  "result": {
    "filename": "test.pptx",
    "file_size": "45.23 KB",
    "download_url": "http://localhost:8080/download/abc123...",
    "download_expires_in": "60 Minuten"
  }
}
```

## Deployment zu DigitalOcean

Nach Integration:

1. **Code committen und pushen:**
```bash
git add remote-mcp-server-with-skills.js
git commit -m "Integrate download-links in main server"
git push
```

2. **DigitalOcean deployed automatisch** (wegen `.do/app.yaml`)

3. **Teste Production:**
```bash
curl -X POST https://mcp-bus-suyns.ondigitalocean.app/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "create_powerpoint",
    "parameters": {
      "title": "Production Test",
      "slides": [{"title": "Test", "content": ["Works!"]}]
    }
  }'
```

Erwarteter Download-Link:
```
https://mcp-bus-suyns.ondigitalocean.app/download/token...
```

---

**Nach dieser Integration gibt es KEINE Platzhalter-Meldungen mehr!**
**Alle Office-Tools geben ECHTE Download-Links zurück.**
