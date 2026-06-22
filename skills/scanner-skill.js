/**
 * Scanner Skill Handler
 *
 * Verwaltet die Kommunikation mit dem lokalen Scanner-Service
 * Kann über Chat-Befehl ($scanner) aktiviert werden
 */

const SCANNER_SERVICE_URL = process.env.SCANNER_SERVICE_URL || 'http://localhost:8085';

let serviceStatus = 'unknown';
let lastHealthCheck = null;

/**
 * Prüfe ob Scanner-Service erreichbar ist
 */
async function checkScannerService() {
    try {
        const response = await fetch(`${SCANNER_SERVICE_URL}/health`, {
            timeout: 5000
        });

        if (response.ok) {
            const data = await response.json();
            serviceStatus = 'online';
            lastHealthCheck = new Date().toISOString();
            return {
                status: 'online',
                scanners: data.scanners,
                activeSessions: data.activeSessions,
                ocrReady: data.ocrReady,
                url: SCANNER_SERVICE_URL
            };
        } else {
            serviceStatus = 'error';
            return { status: 'error', message: 'Service returned error' };
        }
    } catch (error) {
        serviceStatus = 'offline';
        return {
            status: 'offline',
            message: `Scanner-Service nicht erreichbar unter ${SCANNER_SERVICE_URL}`,
            hint: 'Bitte starten Sie den Scanner-Service lokal: cd scanner && npm start'
        };
    }
}

/**
 * Führe Scanner-Tool aus (Proxy zum lokalen Service)
 */
async function executeScannerTool(toolName, parameters) {
    // Prüfe Service-Status
    const health = await checkScannerService();
    if (health.status !== 'online') {
        return {
            error: true,
            message: health.message || 'Scanner-Service offline',
            hint: health.hint,
            action: 'start_scanner_service'
        };
    }

    // Mapping von Skill-Tool-Namen zu Service-Endpunkten
    const endpointMap = {
        'list_scanners': { method: 'GET', endpoint: '/scanners' },
        'scan_document': { method: 'POST', endpoint: '/scan' },
        'ocr_document': { method: 'POST', endpoint: '/ocr' },
        'create_scan_pdf': { method: 'POST', endpoint: '/create-pdf' },
        'summarize_scan': { method: 'POST', endpoint: '/summarize' },
        'send_scan_email': { method: 'POST', endpoint: '/send-email' }
    };

    const config = endpointMap[toolName];
    if (!config) {
        return { error: true, message: `Unbekanntes Scanner-Tool: ${toolName}` };
    }

    try {
        const fetchOptions = {
            method: config.method,
            headers: { 'Content-Type': 'application/json' }
        };

        if (config.method === 'POST') {
            fetchOptions.body = JSON.stringify(parameters || {});
        }

        const response = await fetch(`${SCANNER_SERVICE_URL}${config.endpoint}`, fetchOptions);
        const data = await response.json();

        if (!response.ok) {
            return {
                error: true,
                message: data.error || 'Scanner-Service Fehler',
                details: data
            };
        }

        return {
            success: true,
            result: data
        };

    } catch (error) {
        return {
            error: true,
            message: `Fehler bei Scanner-Operation: ${error.message}`
        };
    }
}

/**
 * Generiere Antwort für $scanner Befehl
 */
function getScannerHelpMessage() {
    return `
**Scanner Skill aktiviert**

Verfügbare Befehle:
- **$scanner status** - Prüfe Scanner-Service Status
- **$scanner list** - Liste verfügbare Scanner
- **$scanner scan** - Starte einen Scan
- **$scanner ocr** - Texterkennung (OCR)
- **$scanner email** - Scan per Email versenden

Oder verwenden Sie die GUI:
→ Öffnen Sie tenant-admin-gui.html → Tab "Scanner"

Scanner-Service URL: ${SCANNER_SERVICE_URL}
`;
}

/**
 * Handle $scanner Chat-Befehl
 */
async function handleScannerCommand(subCommand, args = {}) {
    switch (subCommand) {
        case 'status':
        case 'health':
            return await checkScannerService();

        case 'list':
        case 'scanners':
            return await executeScannerTool('list_scanners', {});

        case 'scan':
        case 'start':
            return await executeScannerTool('scan_document', args);

        case 'ocr':
            return await executeScannerTool('ocr_document', args);

        case 'pdf':
            return await executeScannerTool('create_scan_pdf', args);

        case 'summarize':
        case 'summary':
            return await executeScannerTool('summarize_scan', args);

        case 'email':
        case 'mail':
        case 'send':
            return await executeScannerTool('send_scan_email', args);

        case 'help':
        case '':
        case undefined:
            return {
                message: getScannerHelpMessage(),
                serviceUrl: SCANNER_SERVICE_URL,
                status: serviceStatus
            };

        default:
            return {
                error: true,
                message: `Unbekannter Scanner-Befehl: ${subCommand}`,
                help: getScannerHelpMessage()
            };
    }
}

// Scanner Skill Definition für MCP
const SCANNER_SKILL = {
    id: 'scanner',
    name: 'Scanner Skill',
    description: 'Scannt Dokumente, führt OCR aus und versendet per Email',
    triggerCommands: ['$scanner', '$scan', '$ocr'],
    checkService: checkScannerService,
    executeTool: executeScannerTool,
    handleCommand: handleScannerCommand,
    getHelp: getScannerHelpMessage,
    serviceUrl: SCANNER_SERVICE_URL
};

module.exports = {
    SCANNER_SKILL,
    checkScannerService,
    executeScannerTool,
    handleScannerCommand,
    getScannerHelpMessage,
    SCANNER_SERVICE_URL
};
