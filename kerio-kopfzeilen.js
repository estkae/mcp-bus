/**
 * Sicherheitsrelevante Kopfzeilen einer Mail, fuer kerio_read_email.
 *
 * Der SLS-Security-Leadserver beurteilt Mails mit einem Sprachmodell. Ohne
 * Kopfzeilen sieht er nur Absender, Betreff, Links und Text — die staerksten
 * Belege fehlen: ein Reply-To auf eine fremde Domain, das Ergebnis von SPF und
 * DKIM, das Urteil des Kerio-Spamfilters. Geliefert wird eine feste Auswahl,
 * nicht der ganze Kopf: Received-Ketten und Signaturen sind lang und sagen dem
 * Modell nichts.
 *
 * Bewusst ohne Abhaengigkeit, damit sich die Auswahl ohne IMAP testen laesst.
 */

const NAMEN = /^(authentication-results|arc-authentication-results|received-spf|dkim-signature|reply-to|return-path|sender|x-spam-[a-z-]+|x-kerio-[a-z-]+|x-mailer)$/i;

// Ein Kopf kann aus einem Angreifer-Text bestehen; begrenzt wird er trotzdem.
const MAX_LAENGE = 500;
const MAX_ZEILEN = 30;

/**
 * DKIM-Signatur auf das Wesentliche kuerzen: wer signiert (d=), mit welchem
 * Schluessel (s=). Der Signaturblock selbst ist fuer eine Beurteilung wertlos.
 */
function dkimKurz(wert) {
  const teile = {};
  for (const m of String(wert).matchAll(/(?:^|;)\s*([ads])=([^;]*)/g)) {
    teile[m[1]] = m[2].replace(/\s+/g, '');
  }
  return ['d', 's', 'a'].filter(k => teile[k]).map(k => `${k}=${teile[k]}`).join('; ');
}

/**
 * @param {Array<{key: string, line: string}>} headerLines  mailparser `parsed.headerLines`
 * @returns {Array<{name: string, value: string}>}
 */
function sicherheitsKopf(headerLines) {
  const aus = [];
  let received = 0;
  let ersterReceived = null;
  for (const h of headerLines || []) {
    const name = String(h.key || '').toLowerCase();
    // `line` ist die Rohzeile "Name: Wert", Folgezeilen eingerueckt.
    const roh = String(h.line || '');
    const wert = roh.slice(roh.indexOf(':') + 1).replace(/\s+/g, ' ').trim();
    if (name === 'received') {
      received += 1;
      // Die oberste Received-Zeile schreibt der eigene Mailserver: sie nennt,
      // von welcher Adresse die Mail tatsaechlich eingeliefert wurde.
      if (ersterReceived === null) ersterReceived = wert;
      continue;
    }
    if (!NAMEN.test(name) || aus.length >= MAX_ZEILEN) continue;
    const v = name === 'dkim-signature' ? dkimKurz(wert) : wert;
    aus.push({ name, value: v.slice(0, MAX_LAENGE) });
  }
  if (ersterReceived !== null) {
    aus.unshift({ name: 'received', value: ersterReceived.slice(0, MAX_LAENGE) });
    aus.push({ name: 'received-anzahl', value: String(received) });
  }
  return aus;
}

module.exports = { sicherheitsKopf, dkimKurz };
