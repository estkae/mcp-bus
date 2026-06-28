# GEVER-Migrationsschnittstelle (eCH-0160) für den MCP-Bus

Liest **produkt-neutrale** GEVER-Exporte nach **eCH-0160 (SIP / arelda v4)** und stellt sie
als MCP-Tools bereit – als Lese-/Migrationsschnittstelle nach `pageindex-service` (TypeDB).

Warum eCH-0160 statt Produkt-DB: GEVER ist eine Produktkategorie (CMI Axioma, Acta Nova/
Rubicon, OneGov, Fabasoft) – jedes mit eigener, proprietärer DB. eCH-0160 ist der offizielle
CH-Austausch-/Ablieferungsstandard, in den **alle** exportieren → ein Parser für alle Quellen.

## Datenstruktur (verifiziert gegen arelda.xsd V1.2 + KOST-Testpaket)

```
paket
 ├─ inhaltsverzeichnis → ordner(header/content) → datei{id, name, pruefalgorithmus, pruefsumme}
 └─ ablieferung
    └─ ordnungssystem
       └─ ordnungssystemposition {id, nummer, titel, schutzfrist…}   (rekursiv)
          └─ dossier {id, titel, aktenzeichen, entstehungszeitraum, federfuehrung, schutzfrist}  (rekursiv = Subdossier)
             └─ dokument {id, titel, autor, dokumenttyp, dateiRef → datei.id}
```
`dateiRef` verknüpft das beschreibende `dokument` mit der physischen `datei` im `content/`-Ordner
(inkl. Prüfsumme → Integritätsnachweis bleibt erhalten).

## Mapping → pageindex-service (TypeDB)

| eCH-0160 | Ziel-Entität | Schlüssel-Mapping |
|---|---|---|
| `paket`/`ablieferung` | `ablieferung` | content-addressierte id (`ABL-<fingerprint>`), provenienz→`ech-provenienz-*` |
| `ordnungssystem` | `ordnungssystem` | content-addressierte id (`OS-<fingerprint>`) |
| `ordnungssystemposition` | `aktenplan-position` | `nummer`→id, `schutzfrist`→`default-retention-years` |
| `dossier` | `dossier` | `aktenzeichen`→id, `entstehungszeitraum`→opened/closed-at + `ech-entstehungszeitraum-*` |
| `dokument` | `document` | `id`→`doc-id`, `titel`→`filename`, `dokumenttyp`→`ech-dokumenttyp` |
| `datei` | `datei` | `id`→`datei-id`, `pruefsumme`→`ech-pruefsumme` |
| unbekannte Felder | `field_registry`/`field_value` (EAV) | verlustfrei (`_eav`) |

Das Schreiben in TypeDB übernimmt der Import-Endpoint `POST /api/gever/import` im pageindex-service (GEX44, idempotent). `gever_map_to_target` liefert nur die Dry-Run-Payload.

## MCP-Tools

| Tool | Zweck |
|---|---|
| `gever_open_sip` | SIP öffnen, Übersicht + Statistik |
| `gever_list_ordnungssystem` | Aktenplan-Baum |
| `gever_list_dossiers` | Dossiers (rekursiv, Filter) |
| `gever_get_dossier` | ein Dossier inkl. Dokumente + Datei-Refs |
| `gever_get_file` | physische Datei (base64) + Prüfsummen-Check |
| `gever_map_to_target` | Mapping → TypeDB-Zielmodell (dry-run) |
| `gever_import_to_typedb` | Mapping + Schreiben nach TypeDB (`POST /api/gever/import`, idempotent; `dryRun` für Vorschau) |

Input je Tool: `sipPath` (Server-Pfad zu ZIP/Ordner), `sipZipBase64` (ZIP base64) oder
`metadataXml` (nur Metadaten-String). `isTestData:true` für KOST-Testpakete.

## ⚠️ Datenschutz (KRITISCH)

Der mcp-bus läuft auf **DigitalOcean FRA (EU, nicht CH)**. Gemeindedaten dürfen die CH/EU-
Grenze nicht unkontrolliert verlassen.

- **KOST-Testpakete** (keine Realdaten): `isTestData:true` → lokales Parsen im Bus = ok.
- **Echte GEVER-Daten**: `GEVER_BACKEND_URL` auf einen GEX44-Endpoint setzen → der Bus
  **proxyt** nur, das Parsen/Mappen läuft lokal auf GEX44. Ohne Backend-URL blockt das
  Privacy-Gate Realdaten (Übersteuern bewusst via `GEVER_ALLOW_LOCAL=true`).

| Env | Wirkung |
|---|---|
| `GEVER_BACKEND_URL` | GEX44-`/execute`-Endpoint; Realdaten werden dorthin geproxt |
| `GEVER_ALLOW_LOCAL=true` | erlaubt lokales Parsen von Realdaten im Bus (nur bewusst) |

## Test

```bash
node test/gever-smoke.js     # nutzt test/fixtures/kost-sample-metadata.xml (3 Dossiers, 17 Dok.)
```

Offizielle KOST-Testpakete: https://github.com/KOST-CECO/eCH-0160 (Ordner mit `header/metadata.xml` + `content/`).

## Quellen / Standards

- eCH-0160 Archivische Ablieferungsschnittstelle (SIP), arelda.xsd V1.2 / Schema 5.0
- eCH-0039 / eCH-0147 (nachrichtenbasierter GEVER-Austausch, gleiche Objektlogik) — TODO falls Live-Transfer statt Archiv-SIP nötig
