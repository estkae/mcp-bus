/**
 * Smoke-Test des Portsicht-Aussenpostens.
 * Ausführen (Server/CI, nicht auf dem Windows-Host):  node test/portsicht-smoke.js
 *
 * Hermetisch: der Test startet seinen eigenen Horchposten auf 127.0.0.1 und misst
 * den — kein echtes Ziel, kein Verkehr nach draussen.
 *
 * Kein Test-Framework – simple Assertions, exit 1 bei Fehler.
 */
const net = require('net');

function assert(cond, msg) {
  if (!cond) { console.error('❌ FAIL:', msg); process.exitCode = 1; }
  else console.log('✅', msg);
}

async function erwarteFehler(fn, teil, msg) {
  try {
    await fn();
    assert(false, `${msg} (kein Fehler geworfen)`);
  } catch (e) {
    assert(e.message.includes(teil), `${msg} → "${e.message}"`);
  }
}

function horchposten(gruss) {
  return new Promise((resolve) => {
    const srv = net.createServer((sock) => { if (gruss) sock.write(gruss); });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

(async () => {
  // Ohne freigegebene Ziele darf nichts gemessen werden.
  process.env.SEC_SCAN_ZIELE = '';
  delete require.cache[require.resolve('../portsicht-connector')];
  let ps = require('../portsicht-connector');
  await erwarteFehler(() => ps.executePortsichtTool('sec_portsicht_scan', {}),
    'keine Ziele freigegeben', 'ohne SEC_SCAN_ZIELE abgelehnt');

  const { srv, port } = await horchposten('SSH-2.0-OpenSSH_9.6p1 Testlauf\r\n');
  const zu = port + 1;   // mit hoher Wahrscheinlichkeit niemand — geprüft wird das Ergebnis

  process.env.SEC_SCAN_ZIELE = '127.0.0.1';
  delete require.cache[require.resolve('../portsicht-connector')];
  ps = require('../portsicht-connector');

  assert(ps.isPortsichtTool('sec_portsicht_scan'), 'Tool wird erkannt');
  assert(!ps.isPortsichtTool('kerio_send_email'), 'fremdes Tool wird nicht beansprucht');

  // Die Zielliste ist eine Erlaubnis, keine Anregung: ein nicht freigegebenes
  // Ziel muss abgelehnt werden, auch wenn es harmlos aussieht.
  await erwarteFehler(() => ps.executePortsichtTool('sec_portsicht_scan', { ziel: '127.0.0.2' }),
    'nicht freigegeben', 'fremdes Ziel abgelehnt');

  await erwarteFehler(() => ps.executePortsichtTool('sec_portsicht_scan',
    { ports: Array.from({ length: 201 }, (_, i) => i + 1) }),
  'zu viele Ports', 'Portgrenze greift');

  const res = await ps.executePortsichtTool('sec_portsicht_scan', { ports: [port, zu] });
  assert(Array.isArray(res.ergebnisse) && res.ergebnisse.length === 1, 'ein Ergebnis je Ziel');

  const e = res.ergebnisse[0];
  assert(e.ziel === '127.0.0.1' && e.fehler === null, 'Ziel gemessen, kein Fehler');
  assert(e.ips.length === 1 && e.ips[0] === '127.0.0.1', 'IP direkt übernommen (keine DNS-Abfrage)');
  assert(e.offen.length === 1, `nur der offene Port gemeldet (ist ${e.offen.length})`);

  const treffer = e.offen[0];
  assert(treffer.port === port && treffer.proto === 'tcp', `Port ${port}/tcp erkannt`);
  assert(treffer.banner.includes('OpenSSH_9.6p1'), `Banner gelesen: "${treffer.banner}"`);
  assert(treffer.adressen.includes('127.0.0.1'), 'antwortende Adresse festgehalten');

  // Ein offener Port, der schweigt, ist offen — leeres Banner darf nicht als "zu" gelten.
  const still = await horchposten(null);
  const res2 = await ps.executePortsichtTool('sec_portsicht_scan', { ports: [still.port] });
  const t2 = res2.ergebnisse[0].offen[0];
  assert(!!t2 && t2.banner === '', 'schweigender Port gilt als offen (Banner leer)');

  srv.close();
  still.srv.close();
  console.log(process.exitCode ? '\n❌ Smoke fehlgeschlagen' : '\n✅ Portsicht-Smoke grün');
})();
