/**
 * eCH-0160 (SIP / arelda v4) Parser
 *
 * Wandelt die `metadata.xml` eines SIP in ein strukturiertes, produkt-neutrales
 * Objektmodell um. Quelle der Wahrheit: arelda.xsd (eCH-0160 V1.2, Schema 5.0)
 * sowie verifiziert gegen die offiziellen KOST-Testpakete.
 *
 * Hierarchie (verifiziert an KOST-Testpaket):
 *   paket
 *     ├─ inhaltsverzeichnis → ordner(header/content) → datei{id,name,pruefsumme}
 *     └─ ablieferung
 *        └─ ordnungssystem
 *           └─ ordnungssystemposition {id,nummer,titel}  (rekursiv)
 *              └─ dossier {id,titel,aktenzeichen,entstehungszeitraum}  (rekursiv = Subdossier)
 *                 └─ dokument {id,titel,dokumenttyp,dateiRef → datei.id}
 *
 * Element-Namen sind generisch (titel, nummer, …); die XSD-simpleType-Namen
 * (titelDossier, …) sind nur Typ-, nicht Element-Bezeichner.
 */

const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,        // arelda nutzt Default-Namespace; xsi:type → type
  parseTagValue: true,
  trimValues: true,
});

/** Immer ein Array zurückgeben (fast-xml-parser macht aus 1 Kind ein Objekt). */
function arr(x) {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

/** Textwert eines Elements robust extrahieren (#text oder Skalar). */
function txt(x) {
  if (x === undefined || x === null) return undefined;
  if (typeof x === 'object') return x['#text'] !== undefined ? String(x['#text']) : undefined;
  return String(x);
}

/** historischerZeitpunkt/Zeitraum → {von, bis} (Datum als String). */
function zeitraum(z) {
  if (!z) return undefined;
  const pick = (node) => {
    if (!node) return undefined;
    // arelda: <von><datum>YYYY-MM-DD</datum></von> oder direktes Datum
    return txt(node.datum) || txt(node.ca?.datum) || txt(node);
  };
  const von = pick(z.von);
  const bis = pick(z.bis);
  if (!von && !bis) return undefined;
  return { von, bis };
}

/** Schutzfrist-Trias → {kategorie, jahre, begruendung}. */
function schutzfrist(node) {
  const kategorie = txt(node.schutzfristenkategorie);
  const jahre = txt(node.schutzfrist);
  const begruendung = txt(node.schutzfristenBegruendung);
  if (!kategorie && !jahre && !begruendung) return undefined;
  return { kategorie, jahre: jahre !== undefined ? Number(jahre) : undefined, begruendung };
}

/** Klassifizierung/Datenschutz/Öffentlichkeit → {klassifizierung, datenschutz, oeffentlichkeit}. */
function schutzstufe(node) {
  const out = {
    klassifizierung: txt(node.klassifizierungskategorie),
    datenschutz: txt(node.datenschutz),
    oeffentlichkeitsstatus: txt(node.oeffentlichkeitsstatus),
    oeffentlichkeitsBegruendung: txt(node.oeffentlichkeitsstatusBegruendung),
  };
  return Object.values(out).some(Boolean) ? out : undefined;
}

/** Datei-Index aus dem inhaltsverzeichnis aufbauen: id → {name,path,pruefsumme}. */
function buildFileIndex(inhaltsverzeichnis) {
  const index = {};
  const walk = (ordner, prefixParts) => {
    for (const o of arr(ordner)) {
      const name = txt(o.name) || '';
      const parts = name ? [...prefixParts, name] : prefixParts;
      for (const d of arr(o.datei)) {
        const id = d['@_id'];
        if (!id) continue;
        index[id] = {
          id,
          name: txt(d.name),
          originalName: txt(d.originalName),
          path: [...parts, txt(d.name)].filter(Boolean).join('/'),
          pruefalgorithmus: txt(d.pruefalgorithmus),
          pruefsumme: txt(d.pruefsumme),
        };
      }
      if (o.ordner) walk(o.ordner, parts);
    }
  };
  if (inhaltsverzeichnis && inhaltsverzeichnis.ordner) walk(inhaltsverzeichnis.ordner, []);
  return index;
}

function parseDokument(d, fileIndex) {
  const dateiRef = txt(d.dateiRef);
  return {
    id: d['@_id'],
    titel: txt(d.titel),
    autor: txt(d.autor),
    dokumenttyp: txt(d.dokumenttyp),
    erscheinungsform: txt(d.erscheinungsform),
    anwendung: txt(d.anwendung),
    registrierdatum: txt(d.registrierdatum),
    schutzstufe: schutzstufe(d),
    bemerkung: txt(d.bemerkung),
    dateiRef,
    datei: dateiRef ? fileIndex[dateiRef] || null : null,
  };
}

function parseDossier(d, fileIndex) {
  return {
    id: d['@_id'],
    titel: txt(d.titel),
    aktenzeichen: txt(d.aktenzeichen),
    zusatzmerkmal: txt(d.zusatzmerkmal),
    entstehungszeitraum: zeitraum(d.entstehungszeitraum),
    federfuehrung: txt(d.federfuehrendeOrganisationseinheit),
    inhalt: txt(d.inhalt),
    formInhalt: txt(d.formInhalt),
    umfang: txt(d.umfang),
    erscheinungsform: txt(d.erscheinungsform),
    schutzfrist: schutzfrist(d),
    schutzstufe: schutzstufe(d),
    bemerkung: txt(d.bemerkung),
    // Vorgang/Aktivität (Workflow-Historie) – roh durchgereicht
    vorgaenge: arr(d.vorgang).map((v) => ({
      titel: txt(v.titel),
      federfuehrung: txt(v.federfuehrung),
      aktivitaeten: arr(v.aktivitaet).map((a) => ({
        vorschreibung: txt(a.vorschreibung),
        bearbeiter: txt(a.bearbeiter),
        abschlussdatum: txt(a.abschlussdatum),
      })),
    })),
    subDossiers: arr(d.dossier).map((sd) => parseDossier(sd, fileIndex)),
    dokumente: arr(d.dokument).map((dok) => parseDokument(dok, fileIndex)),
  };
}

function parseOSP(p, fileIndex) {
  return {
    id: p['@_id'],
    nummer: txt(p.nummer),
    titel: txt(p.titel),
    federfuehrung: txt(p.federfuehrendeOrganisationseinheit),
    schutzfrist: schutzfrist(p),
    schutzstufe: schutzstufe(p),
    unterpositionen: arr(p.ordnungssystemposition).map((sp) => parseOSP(sp, fileIndex)),
    dossiers: arr(p.dossier).map((d) => parseDossier(d, fileIndex)),
  };
}

/**
 * Parse eine vollständige metadata.xml (String) → strukturiertes Modell.
 * @param {string} xml  Inhalt der metadata.xml
 * @returns {{paketTyp,schemaVersion,fileIndex,ordnungssystem,stats}}
 */
function parseMetadataXml(xml) {
  if (typeof xml !== 'string' || !xml.trim()) {
    throw new Error('parseMetadataXml: leerer/ungültiger XML-Input');
  }
  const root = parser.parse(xml);
  const paket = root.paket;
  if (!paket) throw new Error('Kein <paket> Wurzelelement – ist das eine eCH-0160 metadata.xml?');

  const fileIndex = buildFileIndex(paket.inhaltsverzeichnis);

  const ablieferung = paket.ablieferung || {};
  const os = ablieferung.ordnungssystem || {};
  const positionen = arr(os.ordnungssystemposition).map((p) => parseOSP(p, fileIndex));

  // Statistik
  let nDossier = 0, nDok = 0;
  const countD = (d) => { nDossier++; d.dokumente.forEach(() => nDok++); d.subDossiers.forEach(countD); };
  const countP = (p) => { p.dossiers.forEach(countD); p.unterpositionen.forEach(countP); };
  positionen.forEach(countP);

  return {
    paketTyp: txt(paket.paketTyp),
    schemaVersion: paket['@_schemaVersion'],
    provenienz: {
      aktenbildnerName: txt(ablieferung.provenienz?.aktenbildnerName),
      registratur: txt(ablieferung.provenienz?.registratur),
    },
    ordnungssystem: { positionen },
    fileIndex,
    stats: {
      ordnungssystempositionen: countTopAndNested(positionen),
      dossiers: nDossier,
      dokumente: nDok,
      dateien: Object.keys(fileIndex).length,
    },
  };
}

function countTopAndNested(positionen) {
  let n = 0;
  const rec = (p) => { n++; p.unterpositionen.forEach(rec); };
  positionen.forEach(rec);
  return n;
}

/** Alle Dossiers (rekursiv) flach auflisten, inkl. Pfad durch das Ordnungssystem. */
function flattenDossiers(model) {
  const out = [];
  const walkDossier = (d, osPfad, parentDossier) => {
    out.push({
      id: d.id,
      titel: d.titel,
      aktenzeichen: d.aktenzeichen,
      entstehungszeitraum: d.entstehungszeitraum,
      federfuehrung: d.federfuehrung,
      osPfad,
      parentDossierId: parentDossier || null,
      anzahlDokumente: d.dokumente.length,
      anzahlSubDossiers: d.subDossiers.length,
    });
    d.subDossiers.forEach((sd) => walkDossier(sd, osPfad, d.id));
  };
  const walkP = (p, pfad) => {
    const here = [...pfad, `${p.nummer || ''} ${p.titel || ''}`.trim()];
    p.dossiers.forEach((d) => walkDossier(d, here.join(' / '), null));
    p.unterpositionen.forEach((sp) => walkP(sp, here));
  };
  model.ordnungssystem.positionen.forEach((p) => walkP(p, []));
  return out;
}

/** Ein Dossier per id finden (rekursiv). */
function findDossier(model, dossierId) {
  let found = null;
  const walkDossier = (d) => {
    if (found) return;
    if (d.id === dossierId) { found = d; return; }
    d.subDossiers.forEach(walkDossier);
  };
  const walkP = (p) => { p.dossiers.forEach(walkDossier); p.unterpositionen.forEach(walkP); };
  model.ordnungssystem.positionen.forEach(walkP);
  return found;
}

module.exports = { parseMetadataXml, flattenDossiers, findDossier };