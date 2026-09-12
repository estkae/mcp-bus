/**
 * Portsicht-Aussenposten für den MCP-Bus (12.09.2026)
 *
 * Der securityBox-Prüfkreis misst seine Aussengrenze selbst — aber nicht die
 * EIGENE: von innen auf den eigenen Anschluss zu sehen misst nur Hairpin-NAT.
 * Dafür braucht es einen Standort ausserhalb, und das ist dieser Bus.
 *
 * **Hier wird nur GEMESSEN.** Baseline, Delta, Einstufung und Alarme bleiben in
 * core/portsicht.py auf der Box; dieser Konnektor hat kein Gedächtnis und kein
 * Urteil. Er liefert dieselbe Roh-Auskunft wie `_probe()` dort: welcher Port
 * antwortet, und was sagt er beim ersten Kontakt.
 *
 * **Die Zielliste steht in `SEC_SCAN_ZIELE` und NUR dort.** Anders als eine
 * DNS-Abfrage ist das aktiver Verkehr auf ein fremdes System. Würde der Aufrufer
 * das Ziel bestimmen, stünde hier ein offener Portscanner für jeden, der die URL
 * kennt — und der Verkehr käme aus unserem DigitalOcean-Konto. Ein Ziel im
 * Aufruf ist deshalb nur eine Auswahl aus der Liste, nie eine Erweiterung.
 *
 * **Ohne `SEC_SCAN_TOKEN` ist das Tool aus** (fail closed). Anders als bei den
 * kerio_*-Tools gibt es hier keinen Grace-Mode: das Tool ist neu, es gibt keine
 * Aufrufer, die erst umgestellt werden müssten.
 *
 * Die Portlisten kommen vom Aufrufer, damit hier keine zweite Kopie entsteht,
 * die gegenüber der Box veraltet. Ohne Angabe gilt eine knappe Standardliste,
 * die für einen Aufruf von Hand reicht.
 *
 * Tools:
 *   sec_portsicht_scan – freigegebenes Ziel abtasten (TCP-Connect + Banner)
 */

const net = require('net');
const dns = require('dns').promises;

const CONNECT_TIMEOUT = Number(process.env.SEC_SCAN_TIMEOUT_MS || 2000);
const BANNER_TIMEOUT = Number(process.env.SEC_SCAN_BANNER_TIMEOUT_MS || 1500);
const WORKERS = Number(process.env.SEC_SCAN_WORKERS || 12);
const MAX_PORTS = 200;
const MAX_ADRESSEN = 3;   // wie auf der Box: mehr heisst Lastverteilung, nicht mehr Erkenntnis

const STANDARD_PORTS = [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 389, 443, 445,
  465, 587, 993, 995, 1433, 3306, 3389, 5432, 5900, 6379, 8000, 8080, 8443, 9200,
  27017];
const STANDARD_HTTP_PORTS = [80, 8000, 8080, 8888, 9200, 3000, 5000, 8081, 9000, 9090];

const PORTSICHT_TOOLS = [
  {
    name: 'sec_portsicht_scan',
    description: '🔭 Aussenansicht: tastet ein in SEC_SCAN_ZIELE freigegebenes Ziel per TCP-Connect ab und meldet offene Ports samt Banner. Nur Messung, keine Bewertung. Ohne "ziel" werden alle freigegebenen Ziele gemessen.',
    input_schema: {
      type: 'object',
      properties: {
        ziel: { type: 'string', description: 'Eines der in SEC_SCAN_ZIELE freigegebenen Ziele. Weglassen = alle.' },
        ports: { type: 'array', items: { type: 'integer' }, description: `Zu prüfende Ports (max. ${MAX_PORTS}). Ohne Angabe eine knappe Standardliste.` },
        httpPorts: { type: 'array', items: { type: 'integer' }, description: 'Ports, auf denen ein HEAD-Request gesendet wird, um ein Banner zu erhalten.' },
      },
    },
  },
];

const PORTSICHT_TOOL_NAMES = new Set(PORTSICHT_TOOLS.map((t) => t.name));

function isPortsichtTool(name) { return PORTSICHT_TOOL_NAMES.has(name); }

function freigegebeneZiele() {
  return (process.env.SEC_SCAN_ZIELE || '')
    .split(',').map((z) => z.trim()).filter(Boolean);
}

function istIp(wert) {
  return net.isIP(wert) !== 0;
}

async function adressen(ziel) {
  if (istIp(ziel)) return { ips: [ziel], fehler: null };
  try {
    const ips = await dns.resolve4(ziel);
    return { ips: [...new Set(ips)].slice(0, MAX_ADRESSEN), fehler: null };
  } catch (e) {
    // Ein Name ohne A-Record ist nichts zu messen, kein Fehler des Postens.
    if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') {
      return { ips: [], fehler: `${ziel}: keine IPv4-Adresse im DNS` };
    }
    return { ips: [], fehler: `${ziel}: DNS nicht erreichbar (${e.code || e.message})` };
  }
}

/**
 * Ein Port. -> Banner (ggf. leer), wenn offen; null, wenn zu.
 *
 * Der Unterschied zwischen '' und null ist wichtig und entspricht `_probe()` auf
 * der Box: ein offener Port, der schweigt, ist offen.
 */
function probe(ip, port, sendeHead) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let banner = '';
    let offen = false;
    let fertig = false;

    const ende = () => {
      if (fertig) return;
      fertig = true;
      sock.destroy();
      resolve(offen ? banner.slice(0, 300).trim() : null);
    };

    sock.setTimeout(CONNECT_TIMEOUT);
    sock.on('timeout', ende);
    sock.on('error', ende);
    sock.on('close', ende);
    sock.on('connect', () => {
      offen = true;
      sock.setTimeout(BANNER_TIMEOUT);
      if (sendeHead) {
        try { sock.write('HEAD / HTTP/1.0\r\n\r\n'); } catch { /* offen bleibt offen */ }
      }
    });
    sock.on('data', (buf) => {
      banner += buf.toString('utf8');
      if (banner.length >= 300) ende();
    });
    sock.connect(port, ip);
  });
}

async function inHaeppchen(aufgaben, groesse, fn) {
  const out = [];
  for (let i = 0; i < aufgaben.length; i += groesse) {
    out.push(...await Promise.all(aufgaben.slice(i, i + groesse).map(fn)));
  }
  return out;
}

async function scanne(ziel, ports, httpPorts) {
  const { ips, fehler } = await adressen(ziel);
  if (!ips.length) return { ziel, ips: [], offen: [], fehler };

  const http = new Set(httpPorts);
  const aufgaben = [];
  for (const ip of ips) for (const p of ports) aufgaben.push({ ip, port: p });

  const banner = await inHaeppchen(aufgaben, WORKERS,
    (a) => probe(a.ip, a.port, http.has(a.port)));

  const gefunden = new Map();
  aufgaben.forEach((a, i) => {
    if (banner[i] === null) return;
    // Bei mehreren Adressen zaehlt der NAME als Einheit (so sieht es der Kunde);
    // welche Adresse antwortete, steht im Detail.
    if (!gefunden.has(a.port)) {
      gefunden.set(a.port, { port: a.port, proto: 'tcp', banner: '', adressen: [] });
    }
    const e = gefunden.get(a.port);
    e.adressen.push(a.ip);
    if (banner[i] && !e.banner) e.banner = banner[i].slice(0, 200);
  });

  return {
    ziel,
    ips,
    offen: [...gefunden.keys()].sort((a, b) => a - b).map((p) => gefunden.get(p)),
    fehler: null,
  };
}

async function executePortsichtTool(tool, params = {}) {
  if (tool !== 'sec_portsicht_scan') throw new Error('Unknown Portsicht tool: ' + tool);

  const ziele = freigegebeneZiele();
  if (!ziele.length) {
    throw new Error('sec_portsicht_scan: keine Ziele freigegeben (SEC_SCAN_ZIELE ist leer)');
  }

  let zuMessen = ziele;
  if (params.ziel) {
    // Auswahl aus der Liste, niemals Erweiterung.
    if (!ziele.includes(params.ziel)) {
      throw new Error(`sec_portsicht_scan: "${params.ziel}" ist nicht freigegeben`);
    }
    zuMessen = [params.ziel];
  }

  const ports = (params.ports && params.ports.length ? params.ports : STANDARD_PORTS)
    .map(Number).filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
  if (!ports.length) throw new Error('sec_portsicht_scan: keine gültigen Ports');
  if (ports.length > MAX_PORTS) {
    throw new Error(`sec_portsicht_scan: zu viele Ports (${ports.length}, erlaubt ${MAX_PORTS})`);
  }
  const httpPorts = (params.httpPorts && params.httpPorts.length
    ? params.httpPorts : STANDARD_HTTP_PORTS).map(Number);

  const ergebnisse = [];
  for (const z of zuMessen) ergebnisse.push(await scanne(z, [...new Set(ports)], httpPorts));
  return { ergebnisse, gemessen_am: new Date().toISOString() };
}

module.exports = {
  PORTSICHT_TOOLS, isPortsichtTool, executePortsichtTool, freigegebeneZiele,
};
