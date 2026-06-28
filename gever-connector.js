/**
 * GEVER-Connector (eCH-0160 Migrations-Schnittstelle) für den MCP-Bus
 *
 * Liest produkt-neutrale GEVER-Exporte (eCH-0160 SIP) und stellt sie als
 * MCP-Tools bereit – als Lese-/Migrationsschnittstelle zu pageindex-service.
 *
 * DATENSCHUTZ: Der mcp-bus läuft auf DigitalOcean (FRA, EU, NICHT CH).
 *   - KOST-Testpakete (keine Realdaten) → lokales Parsen im Bus = ok.
 *   - ECHTE Gemeinde-/GEVER-Daten → NICHT im Bus parsen. Setze
 *     GEVER_BACKEND_URL (GEX44-Endpoint); dann proxyt der Bus nur, die Daten
 *     bleiben lokal. Ohne diese Env wird bei Realdaten geblockt, sofern
 *     GEVER_ALLOW_LOCAL != 'true'.
 *
 * Tools:
 *   gever_open_sip          – SIP öffnen, validieren, Übersicht
 *   gever_list_ordnungssystem – Aktenplan-Baum
 *   gever_list_dossiers     – Dossiers (rekursiv, gefiltert)
 *   gever_get_dossier       – ein Dossier inkl. Dokumente + Datei-Refs
 *   gever_get_file          – physische Datei (base64) + Prüfsummen-Check
 *   gever_map_to_target     – Mapping → pageindex-service Zielmodell (dry-run)
 *   gever_import_to_typedb  – Mapping + Schreiben nach TypeDB (POST /api/gever/import)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let AdmZip;
try { AdmZip = require('adm-zip'); } catch { AdmZip = null; }

const { parseMetadataXml, flattenDossiers, findDossier } = require('./gever/ech0160-parser');
const { mapToTarget, mapSingleDossier } = require('./gever/ech0160-mapper');

const BACKEND_URL = process.env.GEVER_BACKEND_URL || null; // GEX44-Proxy für Realdaten
const ALLOW_LOCAL = process.env.GEVER_ALLOW_LOCAL === 'true';
const IMPORT_URL = process.env.GEVER_IMPORT_URL || null;   // pageindex-service /api/gever/import (GEX44)
const IMPORT_TOKEN = process.env.GEVER_IMPORT_TOKEN || null; // Bearer-JWT für den Import-Endpoint

const GEVER_TOOLS = [
  {
    name: 'gever_open_sip',
    description: '📦 Öffnet ein eCH-0160 SIP (GEVER-Export) und gibt Paket-Übersicht + Statistik zurück. Quelle: sipPath (Server-Pfad), sipZipBase64 (ZIP base64) oder metadataXml (nur Metadaten-String).',
    input_schema: {
      type: 'object',
      properties: {
        sipPath: { type: 'string', description: 'Pfad zu SIP-ZIP oder entpacktem SIP-Ordner auf dem Server' },
        sipZipBase64: { type: 'string', description: 'SIP als base64-kodiertes ZIP' },
        metadataXml: { type: 'string', description: 'Direkter Inhalt der header/metadata.xml' },
        isTestData: { type: 'boolean', description: 'true für KOST-Testpakete (erlaubt lokales Parsen)', default: false },
      },
    },
  },
  {
    name: 'gever_list_ordnungssystem',
    description: '🗂️ Gibt den Aktenplan-/Ordnungssystem-Baum (Positionen rekursiv) des SIP zurück.',
    input_schema: {
      type: 'object',
      properties: {
        sipPath: { type: 'string' }, sipZipBase64: { type: 'string' }, metadataXml: { type: 'string' },
        isTestData: { type: 'boolean', default: false },
      },
    },
  },
  {
    name: 'gever_list_dossiers',
    description: '📋 Listet alle Dossiers (rekursiv, flach) des SIP. Optionaler Filter nach Titel/Aktenzeichen/Federführung.',
    input_schema: {
      type: 'object',
      properties: {
        sipPath: { type: 'string' }, sipZipBase64: { type: 'string' }, metadataXml: { type: 'string' },
        isTestData: { type: 'boolean', default: false },
        filter: { type: 'string', description: 'Volltext-Filter über Titel/Aktenzeichen/Federführung' },
      },
    },
  },
  {
    name: 'gever_get_dossier',
    description: '📂 Gibt ein einzelnes Dossier vollständig zurück (inkl. Subdossiers, Dokumente, Datei-Referenzen).',
    input_schema: {
      type: 'object',
      properties: {
        sipPath: { type: 'string' }, sipZipBase64: { type: 'string' }, metadataXml: { type: 'string' },
        isTestData: { type: 'boolean', default: false },
        dossierId: { type: 'string', description: 'id oder Aktenzeichen des Dossiers' },
      },
      required: ['dossierId'],
    },
  },
  {
    name: 'gever_get_file',
    description: '📄 Liefert eine physische Datei aus dem SIP-content (base64) und prüft die eCH-0160-Prüfsumme. Benötigt sipPath oder sipZipBase64.',
    input_schema: {
      type: 'object',
      properties: {
        sipPath: { type: 'string' }, sipZipBase64: { type: 'string' },
        idDatei: { type: 'string', description: 'datei-id (dateiRef) aus den Metadaten' },
        isTestData: { type: 'boolean', default: false },
      },
      required: ['idDatei'],
    },
  },
  {
    name: 'gever_map_to_target',
    description: '🔀 Mappt das SIP (oder ein Dossier) auf das pageindex-service TypeDB-Zielmodell (aktenplan-position/dossier/document + EAV). DRY-RUN-Vorschau.',
    input_schema: {
      type: 'object',
      properties: {
        sipPath: { type: 'string' }, sipZipBase64: { type: 'string' }, metadataXml: { type: 'string' },
        isTestData: { type: 'boolean', default: false },
        dossierId: { type: 'string', description: 'optional: nur dieses Dossier mappen' },
        tenant: { type: 'string', description: 'Ziel-Tenant im pageindex-service' },
      },
    },
  },
  {
    name: 'gever_import_to_typedb',
    description: '⬆️ Importiert das SIP (oder ein Dossier) tatsaechlich nach TypeDB: mappt und POSTet die Payload an den pageindex-service-Endpoint POST /api/gever/import (idempotent). dryRun=true gibt nur die Mapping-Vorschau zurueck, ohne zu schreiben.',
    input_schema: {
      type: 'object',
      properties: {
        sipPath: { type: 'string' }, sipZipBase64: { type: 'string' }, metadataXml: { type: 'string' },
        isTestData: { type: 'boolean', default: false },
        dossierId: { type: 'string', description: 'optional: nur dieses Dossier importieren' },
        tenant: { type: 'string', description: 'Ziel-Tenant im pageindex-service' },
        dryRun: { type: 'boolean', default: false, description: 'nur Mapping-Vorschau, nichts schreiben' },
        importUrl: { type: 'string', description: 'override fuer GEVER_IMPORT_URL (pageindex-service /api/gever/import)' },
        token: { type: 'string', description: 'override fuer GEVER_IMPORT_TOKEN (Bearer-JWT)' },
      },
    },
  },
];

const GEVER_TOOL_NAMES = new Set(GEVER_TOOLS.map((t) => t.name));
function isGeverTool(name) { return GEVER_TOOL_NAMES.has(name); }

// ---------------------------------------------------------------------------
// SIP-Zugriff
// ---------------------------------------------------------------------------

/** Lädt metadata.xml + (optional) einen ZIP-/FS-Handle aus den Parametern. */
function loadSip(params) {
  // 1) Direkter Metadaten-String (kein Dateizugriff)
  if (params.metadataXml) {
    return { metadataXml: params.metadataXml, zip: null, dir: null };
  }
  // 2) base64-ZIP
  if (params.sipZipBase64) {
    if (!AdmZip) throw new Error("adm-zip nicht installiert – 'npm install adm-zip' nötig");
    const zip = new AdmZip(Buffer.from(params.sipZipBase64, 'base64'));
    return { metadataXml: readMetaFromZip(zip), zip, dir: null };
  }
  // 3) Server-Pfad: ZIP-Datei oder entpackter Ordner
  if (params.sipPath) {
    const p = params.sipPath;
    const stat = fs.existsSync(p) ? fs.statSync(p) : null;
    if (!stat) throw new Error(`sipPath nicht gefunden: ${p}`);
    if (stat.isDirectory()) {
      const metaPath = path.join(p, 'header', 'metadata.xml');
      if (!fs.existsSync(metaPath)) throw new Error(`header/metadata.xml fehlt in ${p}`);
      return { metadataXml: fs.readFileSync(metaPath, 'utf8'), zip: null, dir: p };
    }
    if (!AdmZip) throw new Error("adm-zip nicht installiert – 'npm install adm-zip' nötig");
    const zip = new AdmZip(p);
    return { metadataXml: readMetaFromZip(zip), zip, dir: null };
  }
  throw new Error('Kein SIP-Input: sipPath, sipZipBase64 oder metadataXml angeben');
}

function readMetaFromZip(zip) {
  const entry = zip.getEntries().find((e) => /(^|\/)header\/metadata\.xml$/.test(e.entryName));
  if (!entry) throw new Error('header/metadata.xml im ZIP nicht gefunden');
  return zip.readAsText(entry);
}

/** Datei-Bytes aus ZIP oder FS-Ordner anhand des relativen Pfads. */
function readContentFile(sip, relPath) {
  if (sip.zip) {
    const entry = sip.zip.getEntries().find((e) => e.entryName.replace(/\\/g, '/').endsWith(relPath));
    if (!entry) return null;
    return sip.zip.readFile(entry);
  }
  if (sip.dir) {
    const abs = path.join(sip.dir, relPath);
    return fs.existsSync(abs) ? fs.readFileSync(abs) : null;
  }
  return null;
}

/** Datenschutz-Gate: Realdaten dürfen nicht lokal im Bus verarbeitet werden. */
function privacyGate(params) {
  const isTest = params.isTestData === true;
  if (isTest || ALLOW_LOCAL) return; // Testpakete oder explizit erlaubt
  if (!BACKEND_URL) {
    throw new Error(
      'DATENSCHUTZ: Echte GEVER-Daten dürfen nicht im mcp-bus (DigitalOcean) verarbeitet werden. ' +
      'Setze GEVER_BACKEND_URL (GEX44) zum Proxen, oder isTestData=true für KOST-Testpakete, ' +
      'oder GEVER_ALLOW_LOCAL=true zum bewussten Übersteuern.'
    );
  }
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

async function executeGeverTool(tool, params = {}) {
  // Realdaten → an GEX44 proxen, falls Backend gesetzt und keine Testdaten
  if (BACKEND_URL && params.isTestData !== true) {
    return proxyToBackend(tool, params);
  }
  privacyGate(params);

  switch (tool) {
    case 'gever_open_sip': {
      const sip = loadSip(params);
      const model = parseMetadataXml(sip.metadataXml);
      return {
        paketTyp: model.paketTyp, schemaVersion: model.schemaVersion,
        provenienz: model.provenienz, stats: model.stats,
      };
    }
    case 'gever_list_ordnungssystem': {
      const model = parseMetadataXml(loadSip(params).metadataXml);
      return { ordnungssystem: model.ordnungssystem, stats: model.stats };
    }
    case 'gever_list_dossiers': {
      const model = parseMetadataXml(loadSip(params).metadataXml);
      let list = flattenDossiers(model);
      if (params.filter) {
        const f = String(params.filter).toLowerCase();
        list = list.filter((d) =>
          [d.titel, d.aktenzeichen, d.federfuehrung, d.osPfad]
            .filter(Boolean).some((v) => String(v).toLowerCase().includes(f)));
      }
      return { count: list.length, dossiers: list };
    }
    case 'gever_get_dossier': {
      const model = parseMetadataXml(loadSip(params).metadataXml);
      const d = findDossier(model, params.dossierId);
      if (!d) throw new Error(`Dossier nicht gefunden: ${params.dossierId}`);
      return d;
    }
    case 'gever_get_file': {
      const sip = loadSip(params);
      const model = parseMetadataXml(sip.metadataXml);
      const datei = model.fileIndex[params.idDatei];
      if (!datei) throw new Error(`datei-id nicht gefunden: ${params.idDatei}`);
      const bytes = readContentFile(sip, datei.path);
      if (!bytes) throw new Error(`Datei nicht im content lesbar: ${datei.path}`);
      const checksum = verifyChecksum(bytes, datei);
      return {
        id: datei.id, name: datei.name, path: datei.path, size: bytes.length,
        pruefsumme: datei.pruefsumme, pruefalgorithmus: datei.pruefalgorithmus,
        checksumOk: checksum.ok, computed: checksum.computed,
        contentBase64: bytes.toString('base64'),
      };
    }
    case 'gever_map_to_target': {
      const model = parseMetadataXml(loadSip(params).metadataXml);
      if (params.dossierId) {
        const d = findDossier(model, params.dossierId);
        if (!d) throw new Error(`Dossier nicht gefunden: ${params.dossierId}`);
        return mapSingleDossier(model, d, { tenant: params.tenant });
      }
      return mapToTarget(model, { tenant: params.tenant });
    }
    case 'gever_import_to_typedb': {
      const model = parseMetadataXml(loadSip(params).metadataXml);
      let mapped;
      if (params.dossierId) {
        const d = findDossier(model, params.dossierId);
        if (!d) throw new Error(`Dossier nicht gefunden: ${params.dossierId}`);
        mapped = mapSingleDossier(model, d, { tenant: params.tenant });
      } else {
        mapped = mapToTarget(model, { tenant: params.tenant });
      }
      if (params.dryRun === true) {
        return { dryRun: true, counts: mapped.counts || null, mapped };
      }
      const importUrl = params.importUrl || IMPORT_URL;
      if (!importUrl) {
        throw new Error(
          'GEVER_IMPORT_URL nicht gesetzt (pageindex-service POST /api/gever/import). ' +
          'Per Env GEVER_IMPORT_URL oder Param importUrl angeben, oder dryRun=true fuer reine Vorschau.'
        );
      }
      const token = params.token || IMPORT_TOKEN;
      const fetchFn = global.fetch || require('node-fetch');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (params.tenant) headers['X-Tenant-ID'] = params.tenant;
      const r = await fetchFn(importUrl.replace(/\/$/, ''), {
        method: 'POST', headers, body: JSON.stringify(mapped),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok && r.status !== 207) {
        throw new Error(`Import-Endpoint Fehler ${r.status}: ${JSON.stringify(data).slice(0, 500)}`);
      }
      return { imported: true, httpStatus: r.status, result: data };
    }
    default:
      throw new Error(`Unbekanntes GEVER-Tool: ${tool}`);
  }
}

function verifyChecksum(bytes, datei) {
  if (!datei.pruefsumme || !datei.pruefalgorithmus) return { ok: null, computed: null };
  const algo = String(datei.pruefalgorithmus).toLowerCase().replace('-', '');
  const supported = { md5: 'md5', sha1: 'sha1', sha256: 'sha256', sha512: 'sha512' };
  if (!supported[algo]) return { ok: null, computed: null };
  const computed = crypto.createHash(supported[algo]).update(bytes).digest('hex');
  return { ok: computed.toLowerCase() === String(datei.pruefsumme).toLowerCase(), computed };
}

async function proxyToBackend(tool, params) {
  const fetchFn = global.fetch || require('node-fetch');
  const url = `${BACKEND_URL.replace(/\/$/, '')}/execute`;
  const r = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, parameters: params }),
  });
  if (!r.ok) throw new Error(`GEVER-Backend (GEX44) Fehler ${r.status}`);
  const data = await r.json();
  return data.result !== undefined ? data.result : data;
}

module.exports = { GEVER_TOOLS, isGeverTool, executeGeverTool, BACKEND_URL };