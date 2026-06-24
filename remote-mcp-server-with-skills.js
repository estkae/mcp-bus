/**
 * Remote MCP Server with Skill-Routing
 *
 * Dieser Server läuft auf DigitalOcean und bietet Token-optimiertes Skill-Routing
 * KEINE lokale Installation nötig (außer ngrok für lokale File-Zugriffe)
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080; // DigitalOcean Standard-Port
// Kerio Connect Integration
let kerioConnector;
try {
  kerioConnector = require('./kerio-connector');
  console.log('✅ Kerio Connector loaded');
} catch (error) {
  console.log('⚠️  Kerio Connector not available:', error.message);
  kerioConnector = null;
}

// File-Server und Office-Tools Integration
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
process.env.SERVER_URL = SERVER_URL;

let officeTools, fileServer;
try {
  fileServer = require('./file-server');
  officeTools = require('./production-tools-office-with-downloads');
  fileServer.setupFileServer(app);
  fileServer.startTokenCleanupJob(15);
  console.log('✅ File-Server mit Download-Links aktiviert');
  console.log('✅ Office Tools (PowerPoint, Excel, Word) geladen');
} catch (error) {
  console.log('⚠️  Office Tools not available:', error.message);
  officeTools = null;
}

// Database Tools Integration
let databaseTools;
try {
  databaseTools = require('./db-tools');
  console.log('✅ Database Tools loaded (MSSQL, MySQL, PostgreSQL, Oracle, SQL Anywhere, Banana, TypeDB)');
} catch (error) {
  console.log('⚠️  Database Tools not available:', error.message);
  databaseTools = null;
}

// Scanner Skill Integration
let scannerSkill;
try {
  scannerSkill = require('./skills/scanner-skill');
  console.log('✅ Scanner Skill loaded (local service proxy)');
} catch (error) {
  console.log('⚠️  Scanner Skill not available:', error.message);
  scannerSkill = null;
}

// Skill-Definitionen laden
let skillDefinitions = null;

async function loadSkillDefinitions() {
  try {
    const filePath = path.join(__dirname, 'skill-definitions.json');
    const data = await fs.readFile(filePath, 'utf-8');
    skillDefinitions = JSON.parse(data);
    console.log(`✅ ${skillDefinitions.skills.length} Skills geladen`);
    return true;
  } catch (error) {
    console.error('❌ Fehler beim Laden der Skill-Definitionen:', error.message);
    // Fallback: Inline Skills
    skillDefinitions = createInlineSkills();
    console.log(`✅ ${skillDefinitions.skills.length} Inline-Skills geladen (Fallback)`);
    return false;
  }
}

// Fallback: Skills direkt im Code definieren
function createInlineSkills() {
  return {
    skills: [
      {
        id: "powerpoint",
        name: "PowerPoint Skill",
        description: "Erstellt PowerPoint-Präsentationen",
        keywords: ["powerpoint", "präsentation", "slides", "folien", "pptx", "presentation"],
        tools: [
          {
            name: "create_powerpoint",
            description: "Erstellt eine PowerPoint-Präsentation",
            input_schema: {
              type: "object",
              properties: {
                title: { type: "string", description: "Titel der Präsentation" },
                slides: {
                  type: "array",
                  description: "Array von Folien",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      content: { type: "array", items: { type: "string" } }
                    }
                  }
                }
              },
              required: ["title", "slides"]
            }
          }
        ]
      },
      {
        id: "excel",
        name: "Excel Skill",
        description: "Erstellt und analysiert Excel-Tabellen",
        keywords: ["excel", "tabelle", "spreadsheet", "xlsx", "daten", "data"],
        tools: [
          {
            name: "create_excel",
            description: "Erstellt eine Excel-Tabelle",
            input_schema: {
              type: "object",
              properties: {
                filename: { type: "string" },
                sheets: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      data: { type: "array", items: { type: "array" } }
                    }
                  }
                }
              },
              required: ["filename", "sheets"]
            }
          }
        ]
      },
      {
        id: "brand-guidelines",
        name: "Brand Guidelines Skill",
        description: "Wendet Brand-Richtlinien an",
        keywords: ["brand", "marke", "corporate", "branding", "guidelines", "richtlinien"],
        tools: [
          {
            name: "apply_brand_guidelines",
            description: "Wendet Brand-Richtlinien auf Inhalte an",
            input_schema: {
              type: "object",
              properties: {
                content: { type: "string" },
                brand: { type: "string", default: "default" }
              },
              required: ["content"]
            }
          }
        ]
      },
      {
        id: "pdf",
        name: "PDF Skill",
        description: "Liest und verarbeitet PDF-Dateien",
        keywords: ["pdf", "dokument", "lesen", "ocr"],
        tools: [
          {
            name: "read_pdf",
            description: "Liest PDF-Dateien",
            input_schema: {
              type: "object",
              properties: {
                filepath: { type: "string" }
              },
              required: ["filepath"]
            }
          }
        ]
      },
      {
        id: "code-review",
        name: "Code Review Skill",
        description: "Führt Code-Reviews durch",
        keywords: ["code", "review", "quality", "bugs", "security"],
        tools: [
          {
            name: "review_code",
            description: "Reviewed Code auf Qualität und Security",
            input_schema: {
              type: "object",
              properties: {
                code: { type: "string" },
                language: { type: "string" }
              },
              required: ["code", "language"]
            }
          }
        ]
      },
      {
        id: "blog-writer",
        name: "Blog Writer Skill",
        description: "Erstellt Blog-Artikel und Content",
        keywords: ["blog", "artikel", "content", "seo", "writing"],
        tools: [
          {
            name: "write_blog_post",
            description: "Schreibt einen Blog-Artikel",
            input_schema: {
              type: "object",
              properties: {
                topic: { type: "string" },
                keywords: { type: "array", items: { type: "string" } }
              },
              required: ["topic"]
            }
          }
        ]
      }
    ]
  };
}

// Router Tool - Das einzige Tool das initial geladen wird (8 Tokens!)
const routerTool = {
  name: "skill_router",
  description: "🎯 Intelligenter Skill-Router: Analysiert Anfragen und lädt nur benötigte Skills. Verfügbar: PowerPoint, Excel, Brand Guidelines, PDF, Code Review, Blog Writer. Token-Einsparung: ~90%",
  input_schema: {
    type: "object",
    properties: {
      user_request: {
        type: "string",
        description: "Die User-Anfrage zum Analysieren"
      },
      context: {
        type: "string",
        description: "Zusätzlicher Kontext",
        default: ""
      }
    },
    required: ["user_request"]
  }
};

// Skill-Selektion basierend auf Anfrage
function selectSkills(userRequest, context = '') {
  const requestLower = (userRequest + ' ' + context).toLowerCase();
  const selectedSkills = [];
  const reasonsMap = new Map();

  skillDefinitions.skills.forEach(skill => {
    let matchScore = 0;
    const reasons = [];

    // Keyword-Matching
    skill.keywords.forEach(keyword => {
      if (requestLower.includes(keyword.toLowerCase())) {
        matchScore += 10;
        reasons.push(`Keyword "${keyword}"`);
      }
    });

    // Tool-Name-Matching
    skill.tools.forEach(tool => {
      const toolWords = tool.name.split('_');
      toolWords.forEach(word => {
        if (requestLower.includes(word.toLowerCase())) {
          matchScore += 5;
          reasons.push(`Tool "${word}"`);
        }
      });
    });

    if (matchScore > 0) {
      selectedSkills.push({ skill, score: matchScore, reasons });
    }
  });

  // Nach Score sortieren und Top 3 nehmen
  selectedSkills.sort((a, b) => b.score - a.score);
  const topSkills = selectedSkills.slice(0, 3);

  topSkills.forEach(s => reasonsMap.set(s.skill.id, s.reasons));

  return {
    skills: topSkills.map(s => s.skill),
    scores: topSkills.map(s => ({ id: s.skill.id, score: s.score })),
    reasons: Object.fromEntries(reasonsMap)
  };
}

// ==================== ENDPOINTS ====================

// GET / - Root
app.get('/', (req, res) => {
  res.json({
    service: '🎯 Remote MCP Server with Skill-Routing',
    version: '2.1.0',
    features: [
      'Token-optimized Skill Routing (~90% savings)',
      'Intelligent Skill Selection',
      '6 Skills: PowerPoint, Excel, Brand, PDF, Code Review, Blog Writer',
      'Kerio Connect Email Integration (IMAP/SMTP)'
    ],
    endpoints: {
      'GET /': 'This page',
      'GET /tools': 'Get Router Tool (8 Tokens)',
      'POST /route': 'Analyze request and select skills',
      'POST /execute': 'Execute a tool',
      'GET /skills': 'List all available skills',
      'GET /health': 'Health check'
    },
    deployed_on: 'DigitalOcean',
    url: 'https://mcp-bus-suyns.ondigitalocean.app'
  });
});

// GET /tools - Gibt Router + Office Tools + Kerio Tools + Database Tools zurück
app.get('/tools', (req, res) => {
  const tools = [routerTool];

  // Add Office tools from skill definitions
  const powerpoint = skillDefinitions.skills.find(s => s.id === 'powerpoint')?.tools[0];
  const excel = skillDefinitions.skills.find(s => s.id === 'excel')?.tools[0];
  const word = skillDefinitions.skills.find(s => s.id === 'word')?.tools[0];
  const pdf = skillDefinitions.skills.find(s => s.id === 'pdf-creator')?.tools[0];

  if (powerpoint) tools.push(powerpoint);
  if (excel) tools.push(excel);
  if (word) tools.push(word);
  if (pdf) tools.push(pdf);

  // Add Kerio tools if configured
  if (kerioConnector && kerioConnector.isKerioConfigured()) {
    tools.push(...kerioConnector.KERIO_TOOLS);
  }

  // Add Database tools if available
  if (databaseTools) {
    tools.push(...databaseTools.DATABASE_TOOLS);
  }

  console.log(`📋 /tools - Returning ${tools.length} tools (Router + Office + Kerio + Database)`);
  res.json(tools);
});

// POST /route - Skill-Selektion
app.post('/route', async (req, res) => {
  const { user_request, context } = req.body;

  console.log(`🔍 Routing: "${user_request}"`);

  if (!user_request) {
    return res.status(400).json({ error: 'user_request erforderlich' });
  }

  try {
    const selection = selectSkills(user_request, context);

    const selectedTools = [];
    selection.skills.forEach(skill => {
      skill.tools.forEach(tool => {
        selectedTools.push({
          ...tool,
          skill_id: skill.id,
          skill_name: skill.name
        });
      });
    });

    console.log(`✅ ${selection.skills.length} Skills: ${selection.skills.map(s => s.id).join(', ')}`);

    res.json({
      success: true,
      request_analysis: {
        original_request: user_request,
        context: context || 'none'
      },
      selected_skills: selection.skills.map(skill => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        tool_count: skill.tools.length
      })),
      selection_reasoning: selection.reasons,
      scores: selection.scores,
      tools: selectedTools,
      token_savings: {
        without_routing: 890,
        with_routing: 8 + (selectedTools.length * 50),
        savings_percentage: Math.round((1 - ((8 + selectedTools.length * 50) / 890)) * 100)
      }
    });
  } catch (error) {
    console.error('❌ Routing-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /scanner - Scanner Skill Befehl ($scanner)
app.post('/scanner', async (req, res) => {
  const { command, args } = req.body;

  console.log(`📷 Scanner command: ${command}`);

  if (!scannerSkill) {
    return res.status(503).json({
      error: 'Scanner Skill nicht verfügbar',
      hint: 'Scanner-Modul konnte nicht geladen werden'
    });
  }

  try {
    const result = await scannerSkill.handleScannerCommand(command, args || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /scanner/status - Scanner Service Status
app.get('/scanner/status', async (req, res) => {
  if (!scannerSkill) {
    return res.status(503).json({ status: 'unavailable' });
  }

  try {
    const status = await scannerSkill.checkScannerService();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /execute - Tool ausführen
app.post('/execute', async (req, res) => {
  const { tool, parameters } = req.body;

  console.log(`🔧 Execute: ${tool}`);

  try {
    let result;

    if (tool === 'skill_router') {
      // Route intern
      const routeResult = selectSkills(parameters.user_request, parameters.context);
      result = routeResult;
    } else if (tool === 'list_all_skills') {
      // Liste alle Skills auf
      result = formatAllSkillsList();
    } else if (tool === 'execute_skill_tool') {
      // Fuehre spezifisches Tool aus
      result = await executeSpecificSkillTool(parameters.tool_name, parameters.parameters);
    } else if (['create_powerpoint', 'create_powerpoint_presentation'].includes(tool)) {
      // Office Tool: PowerPoint
      if (officeTools) {
        result = await officeTools.createPowerPoint(parameters);
      } else {
        throw new Error('Office Tools not available');
      }
    } else if (['create_excel', 'create_excel_spreadsheet'].includes(tool)) {
      // Office Tool: Excel
      if (officeTools) {
        result = await officeTools.createExcel(parameters);
      } else {
        throw new Error('Office Tools not available');
      }
    } else if (['create_word', 'create_word_document'].includes(tool)) {
      // Office Tool: Word
      if (officeTools) {
        result = await officeTools.createWord(parameters);
      } else {
        throw new Error('Office Tools not available');
      }
    } else if (['create_pdf', 'create_pdf_document'].includes(tool)) {
      // Office Tool: PDF
      if (officeTools) {
        result = await officeTools.createPDF(parameters);
      } else {
        throw new Error('Office Tools not available');
      }
    } else if (tool.startsWith('kerio_')) {
      // Kerio Connect Tools
      if (!kerioConnector || !kerioConnector.isKerioConfigured()) {
        throw new Error('Kerio Connect not configured. Set KERIO_HOST, KERIO_USERNAME, KERIO_PASSWORD');
      }

      switch(tool) {
        case 'kerio_list_emails':
          result = await kerioConnector.listEmails(parameters || {});
          break;
        case 'kerio_read_email':
          result = await kerioConnector.readEmail(parameters);
          break;
        case 'kerio_send_email':
          result = await kerioConnector.sendEmail(parameters);
          break;
        case 'kerio_send_email_with_attachment':
          result = await kerioConnector.sendEmailWithAttachment(parameters);
          break;
        case 'kerio_search_emails':
          result = await kerioConnector.searchEmails(parameters);
          break;
        case 'kerio_list_folders':
          result = await kerioConnector.listFolders();
          break;
        default:
          throw new Error('Unknown Kerio tool: ' + tool);
      }
    } else if (scannerSkill && [
      'list_scanners', 'scan_document', 'ocr_document',
      'create_scan_pdf', 'summarize_scan', 'send_scan_email'
    ].includes(tool)) {
      // Scanner Skill - Proxy zum lokalen Service
      const scanResult = await scannerSkill.executeScannerTool(tool, parameters);
      if (scanResult.error) {
        throw new Error(scanResult.message || 'Scanner-Fehler');
      }
      result = scanResult.result;
    } else if (databaseTools && [
      'connect_database', 'disconnect_database', 'execute_query', 'list_tables',
      'describe_table', 'list_active_connections', 'disconnect_all_databases',
      'save_connection_config', 'load_connection_config', 'list_connection_configs',
      'delete_connection_config', 'test_database_connection', 'export_query_results'
    ].includes(tool)) {
      // Database Tools
      result = await databaseTools.handleDatabaseTool(tool, parameters);
    } else {
      // Simuliere Tool-Ausführung (in Produktion: delegiere an spezialisierte Services)
      result = await simulateToolExecution(tool, parameters);
    }

    res.json({ success: true, result });
  } catch (error) {
    console.error(`❌ Execute-Fehler:`, error);
    res.status(500).json({ error: error.message });
  }
});


// Formatiere alle Skills fuer list_all_skills Tool
function formatAllSkillsList() {
  const formattedSkills = skillDefinitions.skills.map(skill => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    keywords: skill.keywords,
    tools: skill.tools.map(t => ({
      name: t.name,
      description: t.description
    }))
  }));

  const skillsList = formattedSkills.map((skill, index) => {
    const toolNames = skill.tools.map(t => t.name).join(', ');
    const keywords = skill.keywords.join(', ');
    return `${index + 1}. **${skill.name}** - ${skill.description}\n   ID: ${skill.id}\n   Tools: ${toolNames}\n   Keywords: ${keywords}`;
  }).join('\n\n');

  return {
    total_skills: skillDefinitions.skills.length,
    skills: formattedSkills,
    message: `📚 Verfügbare Skills (${skillDefinitions.skills.length}):\n\n${skillsList}\n\n💡 Tipp: Verwende skill_router(user_request) um automatisch die richtigen Skills auszuwählen.`
  };
}

// Fuehre ein spezifisches Tool aus einem Skill aus
async function executeSpecificSkillTool(toolName, parameters) {
  // Check for real Office Tools first
  if (officeTools) {
    if (toolName === 'create_powerpoint') {
      return await officeTools.createPowerPoint(parameters);
    } else if (toolName === 'create_excel') {
      return await officeTools.createExcel(parameters);
    } else if (toolName === 'create_word') {
      return await officeTools.createWord(parameters);
    }
  }

  // Fallback: simulation for other tools
  for (const skill of skillDefinitions.skills) {
    const tool = skill.tools.find(t => t.name === toolName);
    if (tool) {
      return {
        success: true,
        skill: skill.name,
        skill_id: skill.id,
        tool: toolName,
        parameters: parameters,
        message: `✅ Tool "${toolName}" aus "${skill.name}" würde in Produktion ausgeführt`,
        note: 'Dies ist eine Simulation. In Produktion würde das Tool die reale Aktion ausführen.',
        timestamp: new Date().toISOString()
      };
    }
  }
  throw new Error(`Tool "${toolName}" nicht gefunden`);
}

// Tool-Simulation (Fallback wenn keine spezialisierten Services verfügbar)
async function simulateToolExecution(toolName, parameters) {
  // Finde Skill für dieses Tool
  let skillName = 'Unknown';
  for (const skill of skillDefinitions.skills) {
    if (skill.tools.find(t => t.name === toolName)) {
      skillName = skill.name;
      break;
    }
  }

  return {
    simulated: true,
    tool: toolName,
    skill: skillName,
    parameters: parameters,
    message: `✅ Tool "${toolName}" würde in Produktion ausgeführt`,
    note: 'Dies ist eine Simulation. In Produktion würde das Tool die reale Aktion ausführen.',
    timestamp: new Date().toISOString()
  };
}

// GET /skills - Alle Skills anzeigen
app.get('/skills', (req, res) => {
  res.json({
    total_skills: skillDefinitions.skills.length,
    skills: skillDefinitions.skills.map(skill => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      keywords: skill.keywords,
      tool_count: skill.tools.length,
      tools: skill.tools.map(t => t.name)
    })),
    token_optimization: {
      traditional_approach: '890 tokens (all skills loaded)',
      with_router: '8 tokens (router only)',
      average_savings: '80-90%'
    }
  });
});

// GET /health - Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Remote MCP Server with Skill-Routing',
    version: '2.1.0',
    skills_loaded: skillDefinitions?.skills.length || 0,
    token_optimization: 'enabled',
    routing_strategy: 'keyword-based',
    deployed_on: 'DigitalOcean',
    timestamp: new Date().toISOString()
  });
});

// GET /kerio-status - Kerio Configuration Status (Debug Endpoint)
app.get('/kerio-status', (req, res) => {
  const status = {
    module_loaded: !!kerioConnector,
    configured: false,
    config: {
      host: 'N/A',
      username: 'N/A',
      imap_port: 'N/A',
      smtp_port: 'N/A',
      use_ssl: 'N/A'
    }
  };

  if (kerioConnector) {
    status.configured = kerioConnector.isKerioConfigured();
    status.config = {
      host: kerioConnector.KERIO_CONFIG?.host || 'NOT SET',
      username: kerioConnector.KERIO_CONFIG?.username || 'NOT SET',
      password_set: !!kerioConnector.KERIO_CONFIG?.password,
      imap_port: kerioConnector.KERIO_CONFIG?.imapPort || 993,
      smtp_port: kerioConnector.KERIO_CONFIG?.smtpPort || 465,
      use_ssl: kerioConnector.KERIO_CONFIG?.useSsl
    };
  }

  res.json(status);
});

// GET /kerio-test - Test Kerio Connection
app.get('/kerio-test', async (req, res) => {
  if (!kerioConnector) {
    return res.json({ error: 'Kerio module not loaded' });
  }

  if (!kerioConnector.isKerioConfigured()) {
    return res.json({
      error: 'Kerio not configured',
      config: {
        host: kerioConnector.KERIO_CONFIG?.host || 'NOT SET',
        username: kerioConnector.KERIO_CONFIG?.username || 'NOT SET',
        password_set: !!kerioConnector.KERIO_CONFIG?.password
      }
    });
  }

  try {
    console.log('🧪 Testing Kerio connection...');
    const result = await kerioConnector.listEmails({ limit: 1 });
    res.json({
      success: true,
      message: 'Kerio connection successful',
      test_result: result
    });
  } catch (error) {
    console.error('🧪 Kerio test failed:', error);
    res.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// ==================== MCP PROTOCOL ENDPOINT ====================
// POST /mcp - ALTER POST-only-Handler (deaktiviert; ersetzt durch Streamable HTTP via SDK in setupMcpStreamable).
// Pfad umbenannt, damit er nicht mehr matcht; Code bleibt als Referenz erhalten.
app.post('/mcp__legacy_disabled', async (req, res) => {
  const message = req.body;
  console.log(`📨 MCP Request: ${message.method}`);

  // Notifications haben keine id - keine Response senden
  if (message.id === undefined) {
    console.log(`📭 MCP Notification (no response needed): ${message.method}`);
    return res.status(204).end();
  }

  try {
    let response;

    switch (message.method) {
      case 'initialize':
        // MCP Initialize - Server-Info zurückgeben
        response = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false }
            },
            serverInfo: {
              name: 'remote-mcp-server',
              version: '2.1.0'
            }
          }
        };
        break;

      case 'initialized':
        // Client hat initialisiert - keine Antwort nötig
        response = { jsonrpc: '2.0', id: message.id, result: {} };
        break;

      case 'tools/list':
        // Liste alle Tools auf
        const allTools = [routerTool];

        // Add Office tools
        const ppt = skillDefinitions.skills.find(s => s.id === 'powerpoint')?.tools[0];
        const xls = skillDefinitions.skills.find(s => s.id === 'excel')?.tools[0];
        const doc = skillDefinitions.skills.find(s => s.id === 'word')?.tools[0];
        const pdfTool = skillDefinitions.skills.find(s => s.id === 'pdf-creator')?.tools[0];

        if (ppt) allTools.push(ppt);
        if (xls) allTools.push(xls);
        if (doc) allTools.push(doc);
        if (pdfTool) allTools.push(pdfTool);

        // Add Kerio tools
        if (kerioConnector && kerioConnector.isKerioConfigured()) {
          allTools.push(...kerioConnector.KERIO_TOOLS);
        }

        // Add Database tools
        if (databaseTools) {
          allTools.push(...databaseTools.DATABASE_TOOLS);
        }

        response = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            tools: allTools.map(tool => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.input_schema
            }))
          }
        };
        break;

      case 'tools/call':
        // Tool ausführen
        const toolName = message.params.name;
        const toolArgs = message.params.arguments || {};

        console.log(`🔧 MCP Tool Call: ${toolName}`);

        let toolResult;

        if (toolName === 'skill_router') {
          toolResult = selectSkills(toolArgs.user_request, toolArgs.context);
        } else if (['create_powerpoint', 'create_powerpoint_presentation'].includes(toolName)) {
          if (officeTools) {
            toolResult = await officeTools.createPowerPoint(toolArgs);
          } else {
            throw new Error('Office Tools not available');
          }
        } else if (['create_excel', 'create_excel_spreadsheet'].includes(toolName)) {
          if (officeTools) {
            toolResult = await officeTools.createExcel(toolArgs);
          } else {
            throw new Error('Office Tools not available');
          }
        } else if (['create_word', 'create_word_document'].includes(toolName)) {
          if (officeTools) {
            toolResult = await officeTools.createWord(toolArgs);
          } else {
            throw new Error('Office Tools not available');
          }
        } else if (['create_pdf', 'create_pdf_document'].includes(toolName)) {
          if (officeTools) {
            toolResult = await officeTools.createPDF(toolArgs);
          } else {
            throw new Error('Office Tools not available');
          }
        } else if (toolName.startsWith('kerio_')) {
          console.log(`📧 Kerio Tool Call: ${toolName}`);
          console.log(`📧 Kerio Connector available: ${!!kerioConnector}`);

          if (!kerioConnector) {
            throw new Error('Kerio Connect module not loaded');
          }

          const isConfigured = kerioConnector.isKerioConfigured();
          console.log(`📧 Kerio configured: ${isConfigured}`);
          console.log(`📧 Kerio Config: Host=${kerioConnector.KERIO_CONFIG?.host || 'N/A'}, User=${kerioConnector.KERIO_CONFIG?.username || 'N/A'}`);

          if (!isConfigured) {
            throw new Error('Kerio Connect not configured. Set KERIO_HOST, KERIO_USERNAME, KERIO_PASSWORD environment variables');
          }

          switch(toolName) {
            case 'kerio_list_emails':
              console.log(`📧 Calling listEmails with args:`, JSON.stringify(toolArgs));
              toolResult = await kerioConnector.listEmails(toolArgs);
              console.log(`📧 listEmails completed successfully`);
              break;
            case 'kerio_read_email':
              toolResult = await kerioConnector.readEmail(toolArgs);
              break;
            case 'kerio_send_email':
              toolResult = await kerioConnector.sendEmail(toolArgs);
              break;
            case 'kerio_send_email_with_attachment':
              toolResult = await kerioConnector.sendEmailWithAttachment(toolArgs);
              break;
            case 'kerio_search_emails':
              toolResult = await kerioConnector.searchEmails(toolArgs);
              break;
            case 'kerio_list_folders':
              toolResult = await kerioConnector.listFolders();
              break;
            default:
              throw new Error('Unknown Kerio tool: ' + toolName);
          }
        } else if (scannerSkill && [
          'list_scanners', 'scan_document', 'ocr_document',
          'create_scan_pdf', 'summarize_scan', 'send_scan_email'
        ].includes(toolName)) {
          // Scanner Skill - Proxy zum lokalen Service
          const scanResult = await scannerSkill.executeScannerTool(toolName, toolArgs);
          if (scanResult.error) {
            throw new Error(scanResult.message || 'Scanner-Fehler');
          }
          toolResult = scanResult.result;
        } else if (databaseTools && [
          'connect_database', 'disconnect_database', 'execute_query', 'list_tables',
          'describe_table', 'list_active_connections', 'disconnect_all_databases',
          'save_connection_config', 'load_connection_config', 'list_connection_configs',
          'delete_connection_config', 'test_database_connection', 'export_query_results'
        ].includes(toolName)) {
          toolResult = await databaseTools.handleDatabaseTool(toolName, toolArgs);
        } else {
          toolResult = await simulateToolExecution(toolName, toolArgs);
        }

        response = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [{
              type: 'text',
              text: JSON.stringify(toolResult, null, 2)
            }]
          }
        };
        break;

      default:
        console.log(`⚠️ Unknown MCP method: ${message.method}`);
        response = {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32601,
            message: `Method not found: ${message.method}`
          }
        };
    }

    console.log(`📤 MCP Response: ${JSON.stringify(response).substring(0, 100)}...`);
    res.json(response);
  } catch (error) {
    console.error(`❌ MCP Error:`, error);
    res.json({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
});

// Backward compatibility: Domain checker (falls vorhanden)
app.post('/check-domain', async (req, res) => {
  const { domain, tlds } = req.body;

  // Simuliere Domain-Check
  const results = tlds.map(tld => ({
    domain: `${domain}.${tld}`,
    tld: tld,
    available: Math.random() > 0.5,
    checked: true
  }));

  res.json({
    results,
    timestamp: new Date().toISOString(),
    source: 'simulated'
  });
});

// ── MCP Streamable HTTP (offizielles SDK) — Claude Desktop Connector ──────────
// Ersetzt den alten POST-only-/mcp-Handler. /execute & alle Skills bleiben unberührt.
function buildToolList() {
  const allTools = [routerTool];
  const ppt = skillDefinitions.skills.find(s => s.id === 'powerpoint')?.tools[0];
  const xls = skillDefinitions.skills.find(s => s.id === 'excel')?.tools[0];
  const doc = skillDefinitions.skills.find(s => s.id === 'word')?.tools[0];
  const pdfTool = skillDefinitions.skills.find(s => s.id === 'pdf-creator')?.tools[0];
  if (ppt) allTools.push(ppt);
  if (xls) allTools.push(xls);
  if (doc) allTools.push(doc);
  if (pdfTool) allTools.push(pdfTool);
  if (kerioConnector && kerioConnector.isKerioConfigured()) allTools.push(...kerioConnector.KERIO_TOOLS);
  if (databaseTools) allTools.push(...databaseTools.DATABASE_TOOLS);
  return allTools;
}

async function executeMcpTool(toolName, toolArgs = {}) {
  if (toolName === 'skill_router') return selectSkills(toolArgs.user_request, toolArgs.context);
  if (['create_powerpoint', 'create_powerpoint_presentation'].includes(toolName)) {
    if (!officeTools) throw new Error('Office Tools not available');
    return await officeTools.createPowerPoint(toolArgs);
  }
  if (['create_excel', 'create_excel_spreadsheet'].includes(toolName)) {
    if (!officeTools) throw new Error('Office Tools not available');
    return await officeTools.createExcel(toolArgs);
  }
  if (['create_word', 'create_word_document'].includes(toolName)) {
    if (!officeTools) throw new Error('Office Tools not available');
    return await officeTools.createWord(toolArgs);
  }
  if (['create_pdf', 'create_pdf_document'].includes(toolName)) {
    if (!officeTools) throw new Error('Office Tools not available');
    return await officeTools.createPDF(toolArgs);
  }
  if (toolName.startsWith('kerio_')) {
    if (!kerioConnector) throw new Error('Kerio Connect module not loaded');
    if (!kerioConnector.isKerioConfigured()) throw new Error('Kerio Connect not configured (KERIO_HOST/USERNAME/PASSWORD)');
    switch (toolName) {
      case 'kerio_list_emails': return await kerioConnector.listEmails(toolArgs);
      case 'kerio_read_email': return await kerioConnector.readEmail(toolArgs);
      case 'kerio_send_email': return await kerioConnector.sendEmail(toolArgs);
      case 'kerio_send_email_with_attachment': return await kerioConnector.sendEmailWithAttachment(toolArgs);
      case 'kerio_search_emails': return await kerioConnector.searchEmails(toolArgs);
      case 'kerio_list_folders': return await kerioConnector.listFolders();
      default: throw new Error('Unknown Kerio tool: ' + toolName);
    }
  }
  if (scannerSkill && ['list_scanners', 'scan_document', 'ocr_document', 'create_scan_pdf', 'summarize_scan', 'send_scan_email'].includes(toolName)) {
    const scanResult = await scannerSkill.executeScannerTool(toolName, toolArgs);
    if (scanResult.error) throw new Error(scanResult.message || 'Scanner-Fehler');
    return scanResult.result;
  }
  if (databaseTools && ['connect_database', 'disconnect_database', 'execute_query', 'list_tables', 'describe_table', 'list_active_connections', 'disconnect_all_databases', 'save_connection_config', 'load_connection_config', 'list_connection_configs', 'delete_connection_config', 'test_database_connection', 'export_query_results'].includes(toolName)) {
    return await databaseTools.handleDatabaseTool(toolName, toolArgs);
  }
  return await simulateToolExecution(toolName, toolArgs);
}

const mcpTransports = {};
async function setupMcpStreamable(app) {
  try {
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const { ListToolsRequestSchema, CallToolRequestSchema, isInitializeRequest } = await import('@modelcontextprotocol/sdk/types.js');
    const { randomUUID } = require('crypto');

    const buildMcpServer = () => {
      const server = new Server({ name: 'mcp-bus', version: '2.1.0' }, { capabilities: { tools: {} } });
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: buildToolList().map(t => ({ name: t.name, description: t.description, inputSchema: t.input_schema }))
      }));
      server.setRequestHandler(CallToolRequestSchema, async (reqMsg) => {
        const result = await executeMcpTool(reqMsg.params.name, reqMsg.params.arguments || {});
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      });
      return server;
    };

    app.post('/mcp', async (req, res) => {
      try {
        const sid = req.headers['mcp-session-id'];
        let transport;
        if (sid && mcpTransports[sid]) {
          transport = mcpTransports[sid];
        } else if (!sid && isInitializeRequest(req.body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableDnsRebindingProtection: false,
            onsessioninitialized: (id) => { mcpTransports[id] = transport; }
          });
          transport.onclose = () => { if (transport.sessionId) delete mcpTransports[transport.sessionId]; };
          await buildMcpServer().connect(transport);
        } else {
          res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: keine gültige Session-ID' }, id: null });
          return;
        }
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: String(err && err.message || err) }, id: null });
      }
    });

    const mcpSession = async (req, res) => {
      const sid = req.headers['mcp-session-id'];
      if (sid && mcpTransports[sid]) { await mcpTransports[sid].handleRequest(req, res); return; }
      if (req.method === 'GET') {
        res.status(200).type('text/plain').send('MCP-Bus läuft (Streamable HTTP). Bitte als MCP-Client/Connector verbinden, nicht im Browser.');
        return;
      }
      res.status(400).send('Ungültige oder fehlende Session-ID');
    };
    app.get('/mcp', mcpSession);
    app.delete('/mcp', mcpSession);
    console.log('✅ MCP Streamable HTTP (/mcp) aktiv (offizielles SDK)');
  } catch (e) {
    console.error('❌ MCP Streamable HTTP Setup fehlgeschlagen (Rest des Bus läuft weiter):', e && e.message || e);
  }
}

// Server starten
async function start() {
  await loadSkillDefinitions();
  await setupMcpStreamable(app);

  app.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════════════════════╗`);
    console.log(`║   🎯 Remote MCP Server with Skill-Routing     ║`);
    console.log(`╠════════════════════════════════════════════════╣`);
    console.log(`║  🚀 Server läuft auf Port ${PORT.toString().padEnd(19)} ║`);
    console.log(`║  📊 Skills geladen: ${skillDefinitions.skills.length.toString().padEnd(24)} ║`);
    console.log(`║  💰 Token-Einsparung: ~90%                     ║`);
    console.log(`║  🌐 DigitalOcean App Platform                  ║`);
    console.log(`╚════════════════════════════════════════════════╝\n`);
    console.log('✅ Server bereit!\n');
  });
}

start();

module.exports = app;
