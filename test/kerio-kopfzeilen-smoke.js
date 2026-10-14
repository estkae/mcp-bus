/**
 * Smoke-Test der Kopfzeilen-Auswahl fuer kerio_read_email.
 * Ausfuehren (Server/CI, nicht auf dem Windows-Host):  node test/kerio-kopfzeilen-smoke.js
 *
 * Kein Test-Framework – simple Assertions, exit 1 bei Fehler.
 */
const { sicherheitsKopf, dkimKurz } = require('../kerio-kopfzeilen');

function assert(cond, msg) {
  if (!cond) { console.error('❌ FAIL:', msg); process.exitCode = 1; }
  else console.log('✅', msg);
}

const zeile = (key, wert) => ({ key, line: `${key}: ${wert}` });

// Aufbau wie die Interactive-Brokers-Faelschung vom 05.10.2026.
const kopf = sicherheitsKopf([
  zeile('Received', 'from mx.pdji.hdbhe.com (203.0.113.7) by mail.aals.ch'),
  zeile('Received', 'from internal by mx.pdji.hdbhe.com'),
  zeile('DKIM-Signature', 'v=1; a=rsa-sha256; d=pdji.hdbhe.com; s=sel1;\r\n\th=from:to; bh=abc; b=AAAAAAAAAAAAAAAAAAAAAAAA'),
  zeile('Reply-To', 'team@interactivebrokers.com'),
  zeile('X-Spam-Status', 'No, hits=2.9 required=5.5 tests=URIBL_JP_SURBL'),
  zeile('Subject', 'Re-Zertifizierung Ihres W-8BEN Steuerformulars'),
  zeile('X-Tracking-Uid', '12345'),
]);
const namen = kopf.map(k => k.name);

assert(namen[0] === 'received' && kopf[0].value.includes('203.0.113.7'),
  'oberste Received-Zeile steht vorn');
assert(kopf.find(k => k.name === 'received-anzahl').value === '2', 'Received werden gezaehlt');
assert(kopf.find(k => k.name === 'reply-to').value === 'team@interactivebrokers.com', 'Reply-To kommt mit');
assert(kopf.find(k => k.name === 'x-spam-status').value.includes('URIBL_JP_SURBL'), 'Spam-Urteil kommt mit');
assert(!namen.includes('subject') && !namen.includes('x-tracking-uid'), 'nur die Auswahl, kein ganzer Kopf');
assert(kopf.find(k => k.name === 'dkim-signature').value === 'd=pdji.hdbhe.com; s=sel1; a=rsa-sha256',
  'DKIM auf Domain, Selektor und Verfahren gekuerzt');
assert(!JSON.stringify(kopf).includes('AAAAAAAA'), 'Signaturblock faellt weg');

assert(dkimKurz('d=x.ch') === 'd=x.ch', 'dkimKurz mit nur einer Angabe');
assert(sicherheitsKopf([]).length === 0 && sicherheitsKopf(undefined).length === 0, 'leerer Kopf ergibt leere Liste');

const lang = sicherheitsKopf([zeile('Authentication-Results', 'x'.repeat(2000))]);
assert(lang[0].value.length === 500, 'ueberlange Werte werden begrenzt');

const viele = sicherheitsKopf(Array.from({ length: 50 }, () => zeile('X-Spam-Flag', 'NO')));
assert(viele.length === 30, 'hoechstens 30 Zeilen');

if (process.exitCode) console.error('\nFEHLGESCHLAGEN'); else console.log('\nalle Pruefungen bestanden');
