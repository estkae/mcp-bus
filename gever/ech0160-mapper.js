/**
 * Mapping  eCH-0160 (extern, produkt-neutral)  →  pageindex-service TypeDB-Zielmodell
 *
 * Ziel-Entitäten (siehe pageindex-service/typedb/schemas/*.tql):
 *   ablieferung            → ablieferung        (SIP-Paket-Ebene, content-addressierte ID)
 *   ordnungssystem         → ordnungssystem
 *   ordnungssystemposition → aktenplan-position
 *   dossier                → dossier
 *   dokument               → document
 *   datei                  → datei              (eigene eCH-0160-Entität, pruefsumme→ech-pruefsumme)
 *   unbekannte Felder      → field_registry / field_value (EAV, verlustfrei)
 *
 * Erzeugt eine DRY-RUN-Vorschau (reines JSON). Das eigentliche Schreiben in
 * TypeDB übernimmt der Import-Endpoint im pageindex-service (GEX44) – diese
 * Schicht stellt nur das deterministische, geprüfte Mapping bereit.
 */

const { flattenDossiers } = require('./ech0160-parser');

/** Jahr aus einem Datum/Zeitraum-String ziehen (für Frist-Heuristik). */
function jahr(dateStr) {
  if (!dateStr) return undefined;
  const m = String(dateStr).match(/(\d{4})/);
  return m ? Number(m[1]) : undefined;
}

/** EAV-Eintrag erzeugen, wenn Wert vorhanden. */
function eav(list, fieldKey, value) {
  if (value === undefined || value === null || value === '') return;
  list.push({ field_key: fieldKey, value: typeof value === 'object' ? JSON.stringify(value) : value });
}

/** Deterministischer, content-addressierter Hash (djb2) → stabile IDs ohne Date.now. */
function djb2(str) {
  let h = 5381;
  const s = String(str);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function mapOSP(p, parentId, acc) {
  const id = p.nummer || p.id;
  const eavFields = [];
  eav(eavFields, 'ech0160-source-id', p.id);
  eav(eavFields, 'klassifizierung', p.schutzstufe?.klassifizierung);
  eav(eavFields, 'datenschutz', p.schutzstufe?.datenschutz);
  eav(eavFields, 'oeffentlichkeitsstatus', p.schutzstufe?.oeffentlichkeitsstatus);

  acc.aktenplanPositionen.push({
    'aktenplan-position-id': String(id),
    'aktenplan-title': p.titel,
    'default-retention-years': p.schutzfrist?.jahre,
    'default-classification': p.schutzstufe?.klassifizierung || 'intern',
    parentPositionId: parentId ? String(parentId) : null,
    federfuehrung: p.federfuehrung,
    _eav: eavFields,
  });

  p.dossiers.forEach((d) => mapDossier(d, id, null, acc));
  p.unterpositionen.forEach((sp) => mapOSP(sp, id, acc));
}

function mapDossier(d, ospId, parentDossierId, acc) {
  const dossierId = d.aktenzeichen || d.id;
  const openedJahr = jahr(d.entstehungszeitraum?.von);
  const closedJahr = jahr(d.entstehungszeitraum?.bis);

  const eavFields = [];
  eav(eavFields, 'ech0160-source-id', d.id);
  eav(eavFields, 'zusatzmerkmal', d.zusatzmerkmal);
  eav(eavFields, 'inhalt', d.inhalt);
  eav(eavFields, 'umfang', d.umfang);
  eav(eavFields, 'erscheinungsform', d.erscheinungsform);
  eav(eavFields, 'klassifizierung', d.schutzstufe?.klassifizierung);
  eav(eavFields, 'datenschutz', d.schutzstufe?.datenschutz);
  eav(eavFields, 'oeffentlichkeitsstatus', d.schutzstufe?.oeffentlichkeitsstatus);
  if (d.vorgaenge?.length) eav(eavFields, 'vorgang-historie', d.vorgaenge);

  acc.dossiers.push({
    'dossier-id': String(dossierId),
    'dossier-title': d.titel,
    'dossier-status': closedJahr ? 'abgeschlossen' : 'in-bearbeitung',
    'dossier-classification': d.schutzstufe?.klassifizierung || 'intern',
    'dossier-opened-at': d.entstehungszeitraum?.von,
    'dossier-closed-at': d.entstehungszeitraum?.bis,
    'dossier-retention-until': d.schutzfrist?.jahre && closedJahr
      ? String(closedJahr + d.schutzfrist.jahre)
      : undefined,
    'dossier-summary': d.inhalt,
    positionId: String(ospId),
    parentDossierId: parentDossierId ? String(parentDossierId) : null,
    federfuehrung: d.federfuehrung,
    _eav: eavFields,
  });

  d.dokumente.forEach((dok) => mapDokument(dok, dossierId, acc));
  d.subDossiers.forEach((sd) => mapDossier(sd, ospId, dossierId, acc));
}

function mapDokument(dok, dossierId, acc) {
  // Verlustfrei: alles, was nicht auf ein bekanntes Attribut faellt, als EAV.
  const eavFields = [];
  eav(eavFields, 'ech0160-source-id', dok.id);
  eav(eavFields, 'autor', dok.autor);
  eav(eavFields, 'erscheinungsform', dok.erscheinungsform);
  eav(eavFields, 'anwendung', dok.anwendung);
  eav(eavFields, 'klassifizierung', dok.schutzstufe?.klassifizierung);
  eav(eavFields, 'datenschutz', dok.schutzstufe?.datenschutz);
  eav(eavFields, 'oeffentlichkeitsstatus', dok.schutzstufe?.oeffentlichkeitsstatus);
  eav(eavFields, 'bemerkung', dok.bemerkung);

  acc.documents.push({
    'document-id': dok.id,
    title: dok.titel,
    autor: dok.autor,
    dokumenttyp: dok.dokumenttyp,                 // → ech-dokumenttyp
    registrierdatum: dok.registrierdatum,         // → ech-registrierdatum
    dossierId: String(dossierId),
    // datei → entity datei (eCH-0160): Prüfsumme bleibt als Integritätsnachweis erhalten
    datei: dok.datei
      ? {
          'datei-id': dok.datei.id,
          'ech-originalname': dok.datei.originalName || dok.datei.name,
          'ech-pruefsumme': dok.datei.pruefsumme,
          'ech-pruefalgorithmus': dok.datei.pruefalgorithmus,
          path: dok.datei.path,
        }
      : null,
    _eav: eavFields,
  });
}

/**
 * Vollständiges Modell → Ziel-Payload (dry-run) für den pageindex-service Import.
 * @param {object} model  Ergebnis von parseMetadataXml()
 * @param {object} [opts] { tenant }
 */
function mapToTarget(model, opts = {}) {
  const acc = { aktenplanPositionen: [], dossiers: [], documents: [] };
  model.ordnungssystem.positionen.forEach((p) => mapOSP(p, null, acc));

  // SIP-Paket-Ebene: ablieferung + ordnungssystem. Quelle hat keine eigenen IDs
  // → content-addressiert (deterministisch, idempotenter Re-Import desselben SIP).
  const prov = model.provenienz || {};
  const fingerprint = djb2(
    JSON.stringify(acc.aktenplanPositionen.map((p) => p['aktenplan-position-id'])) +
    '|' + (prov.aktenbildnerName || '') + '|' + (model.paketTyp || '')
  );
  const ablieferungId = opts.ablieferungId || `ABL-${fingerprint}`;
  const ordnungssystemId = opts.ordnungssystemId || `OS-${fingerprint}`;

  const ablieferung = {
    'ablieferung-id': ablieferungId,
    ablieferungstyp: model.paketTyp || null,
    'ech-provenienz-aktenbildner': prov.aktenbildnerName || null,
    'ech-provenienz-system': prov.registratur || null,
    status: 'imported',
    rootPositionIds: acc.aktenplanPositionen
      .filter((p) => !p.parentPositionId)
      .map((p) => p['aktenplan-position-id']),
  };
  const ordnungssystem = {
    'ordnungssystem-id': ordnungssystemId,
    'ordnungssystem-name': prov.aktenbildnerName || 'Ordnungssystem',
    'ordnungssystem-generation': model.schemaVersion || null,
  };

  return {
    tenant: opts.tenant || null,
    source: { standard: 'eCH-0160', paketTyp: model.paketTyp, schemaVersion: model.schemaVersion, provenienz: prov },
    target: 'pageindex-service/typedb',
    counts: {
      ablieferung: 1,
      ordnungssystem: 1,
      'aktenplan-position': acc.aktenplanPositionen.length,
      dossier: acc.dossiers.length,
      document: acc.documents.length,
      datei: acc.documents.filter((d) => d.datei).length,
    },
    payload: { ablieferung, ordnungssystem, ...acc },
    note: 'DRY-RUN. Schreiben erfolgt im pageindex-service (GEX44); unbekannte Felder über EAV (_eav).',
  };
}

/** Nur Mapping eines einzelnen Dossiers (für Vorschau). */
function mapSingleDossier(model, dossier, opts = {}) {
  const acc = { aktenplanPositionen: [], dossiers: [], documents: [] };
  mapDossier(dossier, dossier.aktenzeichen || dossier.id, null, acc);
  return { tenant: opts.tenant || null, source: { standard: 'eCH-0160' }, payload: acc };
}

module.exports = { mapToTarget, mapSingleDossier, flattenDossiers };