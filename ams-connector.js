/**
 * AMS Connector — Proxy zu pageindex-service (ams) Meeting-Agent.
 *
 * Exponiert AGS/Claude die AMS-Sitzungs-/Protokoll-Capability über den Bus.
 * DATENSCHUTZ: Der Bus läuft auf DigitalOcean (US). Hier laufen NUR Trigger +
 * Status (meetingId, Tenant, Fortschritt, sessionId/statusUrl) — KEINE Inhalte
 * (Dossier/Protokolltext). Die eigentliche Verarbeitung bleibt in AMS/GEX44 (EU).
 */

const AMS_BASE = (process.env.AMS_BASE_URL || 'https://ams.locara.ch').replace(/\/+$/, '');
const AMS_TENANT = process.env.AMS_TENANT_ID || 'tenant_mo16wi3qhdj6qui0u';

function isAmsConfigured() {
  return !!AMS_BASE;
}

async function amsFetch(path, { method = 'GET', body, tenantId } = {}) {
  const res = await fetch(`${AMS_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': tenantId || AMS_TENANT
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const detail = typeof data === 'object' ? JSON.stringify(data).slice(0, 250) : String(text).slice(0, 250);
    throw new Error(`AMS ${method} ${path} -> ${res.status}: ${detail}`);
  }
  return data;
}

// Trigger: Sitzungsvorbereitung. Nur meetingId/tenant/generatePdf rein, sessionId raus.
async function sitzungVorbereiten(p = {}) {
  if (!p.meetingId) throw new Error('meetingId fehlt');
  return await amsFetch(`/api/meeting-agent/prepare/${encodeURIComponent(p.meetingId)}`, {
    method: 'POST', body: { generatePdf: !!p.generatePdf }, tenantId: p.tenantId
  });
}

async function sitzungStatus(p = {}) {
  if (!p.sessionId) throw new Error('sessionId fehlt');
  return await amsFetch(`/api/meeting-agent/status/${encodeURIComponent(p.sessionId)}`, { tenantId: p.tenantId });
}

async function auftraege(p = {}) {
  if (!p.meetingId) throw new Error('meetingId fehlt');
  return await amsFetch(`/api/meeting-agent/auftraege/${encodeURIComponent(p.meetingId)}`, { tenantId: p.tenantId });
}

const AMS_TOOLS = [
  {
    name: 'ams_sitzung_vorbereiten',
    description: 'Startet die Sitzungsvorbereitung in AMS (meeting-agent prepare): Traktanden analysieren, Dokumente suchen, Dossier erstellen. Nur Trigger — liefert sessionId/statusUrl; Inhalte bleiben in AMS (EU).',
    input_schema: {
      type: 'object',
      properties: {
        meetingId: { type: 'string', description: 'Meeting-ID, z.B. M-2026-1769E9C6' },
        tenantId: { type: 'string', description: 'Tenant (Default: Unterschächen)' },
        generatePdf: { type: 'boolean', description: 'Dossier zusätzlich als PDF (Default false)' }
      },
      required: ['meetingId']
    }
  },
  {
    name: 'ams_sitzung_status',
    description: 'Status/Fortschritt einer laufenden AMS-Sitzungsvorbereitung (state + progress %).',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'sessionId aus ams_sitzung_vorbereiten' },
        tenantId: { type: 'string' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'ams_auftraege',
    description: 'Listet Aufträge/Beschlüsse eines Meetings aus AMS.',
    input_schema: {
      type: 'object',
      properties: {
        meetingId: { type: 'string' },
        tenantId: { type: 'string' }
      },
      required: ['meetingId']
    }
  }
];

function isAmsTool(name) {
  return typeof name === 'string' && name.startsWith('ams_');
}

async function executeAmsTool(name, params = {}) {
  switch (name) {
    case 'ams_sitzung_vorbereiten': return await sitzungVorbereiten(params);
    case 'ams_sitzung_status': return await sitzungStatus(params);
    case 'ams_auftraege': return await auftraege(params);
    default: throw new Error('Unknown AMS tool: ' + name);
  }
}

module.exports = { AMS_TOOLS, isAmsTool, executeAmsTool, isAmsConfigured, AMS_BASE, AMS_TENANT };