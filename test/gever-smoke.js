/**
 * Smoke-Test der GEVER-Migrationsschnittstelle gegen das KOST-Testpaket.
 * Ausführen (GEX44/CI, nicht zwingend lokal):  node test/gever-smoke.js
 *
 * Kein Test-Framework – simple Assertions, exit 1 bei Fehler.
 */
const fs = require('fs');
const path = require('path');
const { executeGeverTool } = require('../gever-connector');

const FIXTURE = path.join(__dirname, 'fixtures', 'kost-sample-metadata.xml');
const metadataXml = fs.readFileSync(FIXTURE, 'utf8');
const base = { metadataXml, isTestData: true };

function assert(cond, msg) {
  if (!cond) { console.error('❌ FAIL:', msg); process.exitCode = 1; }
  else console.log('✅', msg);
}

(async () => {
  const open = await executeGeverTool('gever_open_sip', base);
  console.log('Paket:', open.paketTyp, open.schemaVersion, JSON.stringify(open.stats));
  assert(open.paketTyp === 'SIP', 'paketTyp = SIP');
  assert(open.stats.dossiers === 3, `3 Dossiers (ist ${open.stats.dossiers})`);
  assert(open.stats.dokumente === 17, `17 Dokumente (ist ${open.stats.dokumente})`);

  const os = await executeGeverTool('gever_list_ordnungssystem', base);
  assert(os.ordnungssystem.positionen.length > 0, 'Ordnungssystem hat Positionen');

  const list = await executeGeverTool('gever_list_dossiers', base);
  assert(list.count === 3, `list_dossiers → 3 (ist ${list.count})`);
  const first = list.dossiers[0];
  assert(!!first.id && !!first.titel, 'Dossier hat id + titel');
  console.log('  Bsp-Dossier:', first.aktenzeichen, '–', first.titel);

  const dossier = await executeGeverTool('gever_get_dossier', { ...base, dossierId: first.id });
  assert(dossier.id === first.id, 'get_dossier liefert korrektes Dossier');
  assert(Array.isArray(dossier.dokumente), 'Dossier hat dokumente-Array');

  const mapped = await executeGeverTool('gever_map_to_target', { ...base, tenant: 'aals' });
  console.log('Mapping-Counts:', JSON.stringify(mapped.counts));
  assert(mapped.payload.dossiers.length === 3, 'Mapping erzeugt 3 dossiers');
  assert(mapped.payload.aktenplanPositionen.length > 0, 'Mapping erzeugt aktenplan-positionen');
  assert(mapped.payload.documents.length === 17, '17 documents gemappt');

  // dateiRef-Auflösung: mind. ein Dokument hat aufgelöste Datei mit Prüfsumme
  const withFile = mapped.payload.documents.find((d) => d.datei && d.datei['ech-pruefsumme']);
  assert(!!withFile, 'mind. 1 Dokument mit aufgelöster Datei + Prüfsumme (ech-pruefsumme)');

  // SIP-Paket-Ebene wird mitgemappt (ablieferung + ordnungssystem)
  assert(!!mapped.payload.ablieferung?.['ablieferung-id'], 'Mapping erzeugt ablieferung');
  assert(!!mapped.payload.ordnungssystem?.['ordnungssystem-id'], 'Mapping erzeugt ordnungssystem');

  console.log(process.exitCode ? '\n❌ Tests mit Fehlern' : '\n✅ Alle Smoke-Tests grün');
})().catch((e) => { console.error('💥', e); process.exit(1); });
