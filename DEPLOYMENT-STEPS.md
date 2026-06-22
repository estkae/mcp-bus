# 🚀 Deployment-Schritte für DigitalOcean

## ✅ Status

- **Code gepusht**: ✅ Commit `bbb60e4`
- **Procfile updated**: ✅ `web: python skill-router.py`
- **Auto-Deploy**: ⏳ Muss manuell getriggert werden

---

## 📋 Manuelle Deployment-Schritte

### Schritt 1: DigitalOcean App Platform öffnen

1. Gehe zu: https://cloud.digitalocean.com/apps
2. Finde deine App: **mcp-bus-suyns**
3. Klicke auf die App

### Schritt 2: Deployment triggern

**Option A: Manual Deploy (Empfohlen)**

1. Im App-Dashboard → Rechts oben
2. Klicke auf: **"Actions"** Dropdown
3. Wähle: **"Force Rebuild and Deploy"**
4. Bestätige mit: **"Rebuild and Deploy"**

**Option B: Settings Update**

1. → Settings Tab
2. → Components Section
3. → Klicke auf deine Komponente (web)
4. → Edit
5. Prüfe **Run Command**:
   ```
   python skill-router.py
   ```
6. Falls anders → ändere und speichere
7. → Save → Redeploy

### Schritt 3: Deployment beobachten

1. → Overview Tab
2. Siehst du: **"Deploying..."**
3. Warte ~2-3 Minuten

**Deployment-Status:**
- **Building**: ⏳ Code wird kompiliert
- **Deploying**: ⏳ Server wird gestartet
- **Live**: ✅ Fertig!

### Schritt 4: Runtime Logs prüfen

1. → Runtime Logs Tab (oben)
2. Erwartete Ausgabe:

```
============================================================
🎯 Remote MCP Server with Skill-Routing
============================================================
Skills loaded: 6
Total tools: 6
Token optimization: ~90%
Port: 8080
============================================================
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8080
```

**Wenn du das siehst**: ✅ **Deployment erfolgreich!**

---

## 🧪 Nach Deployment testen

### Test 1: MCP Endpoint (406 = OK!)

```bash
curl -k https://mcp-bus-suyns.ondigitalocean.app/mcp
```

**Erwartete Antwort:**
```
Not Acceptable (406)
```

**Das ist RICHTIG!** FastMCP gibt 406 zurück bei Browser-Requests.
Der Server läuft korrekt!

### Test 2: In Claude-Webapp konfigurieren

1. Öffne: https://claud-webapp-c75xo.ondigitalocean.app/
2. → Einstellungen ⚙️
3. → 🌐 Remote MCP Server URLs
4. Trage ein:
   ```
   https://mcp-bus-suyns.ondigitalocean.app/mcp
   ```
5. → Speichern

### Test 3: Skills abrufen

In der Claude-Webapp:

```
"Welche Skills stehen zur Verfügung?"
```

**Erwartete Antwort:**
```
📚 Verfügbare Skills (6):

PowerPoint Skill
  ID: powerpoint
  ...

[etc.]
```

### Test 4: Skill-Routing testen

```
"Create a PowerPoint presentation"
```

**Erwartete Antwort:**
```
🎯 Skill-Router Analyse

Request: Create a PowerPoint presentation

✅ Ausgewählte Skills (1):
  • PowerPoint Skill  (Score: 25)

💰 Token-Einsparung:
  • Ohne Routing: 890 Tokens
  • Mit Routing:   58 Tokens
  • Ersparnis:     93%
```

---

## 🐛 Troubleshooting

### Problem: Deployment bleibt bei "Building"

**Mögliche Ursachen:**
1. `requirements.txt` fehlt `fastmcp`
2. Syntax-Fehler in `skill-router.py`
3. Port-Konfiguration falsch

**Lösung:**

1. **Prüfe requirements.txt:**
   ```bash
   cd "/c/Users/kae/OneDrive - AALS Software AG/locara/source/repos/remote-mcp-server"
   cat requirements.txt
   ```

   Sollte enthalten:
   ```
   fastmcp
   python-whois
   dnspython
   ```

2. **Falls fastmcp fehlt:**
   ```bash
   echo "fastmcp" >> requirements.txt
   git add requirements.txt
   git commit -m "Add fastmcp dependency"
   git push origin main
   ```

3. **In DigitalOcean:**
   - → Settings → Components → Edit
   - Run Command: `python skill-router.py`
   - Force Rebuild

### Problem: 404 auf allen Endpoints

**Ursache:** Falsches Procfile oder Run Command

**Lösung:**

1. **Prüfe Procfile lokal:**
   ```bash
   cat Procfile
   ```

   Sollte sein:
   ```
   web: python skill-router.py
   ```

2. **Falls falsch:**
   ```bash
   echo "web: python skill-router.py" > Procfile
   git add Procfile
   git commit -m "Fix Procfile"
   git push origin main
   ```

3. **In DigitalOcean:**
   - Settings → Components → Edit
   - Run Command: `python skill-router.py`
   - Save → Force Rebuild

### Problem: Server startet nicht

**Ursache:** Port-Problem oder Import-Fehler

**Lösung:**

1. **Runtime Logs prüfen** in DigitalOcean
2. Häufige Fehler:

   **Import Error:**
   ```
   ModuleNotFoundError: No module named 'fastmcp'
   ```
   → Lösung: `fastmcp` zu requirements.txt hinzufügen

   **Port Error:**
   ```
   Error: Address already in use
   ```
   → Lösung: Prüfe ob `PORT` Environment Variable gesetzt ist

3. **Environment Variables prüfen:**
   - DigitalOcean → Settings → Environment Variables
   - Sollte enthalten: `PORT=8080`

---

## ✅ Deployment Checkliste

Schritt für Schritt:

- [ ] **Step 1**: DigitalOcean App Platform öffnen
- [ ] **Step 2**: App `mcp-bus-suyns` auswählen
- [ ] **Step 3**: Actions → Force Rebuild and Deploy
- [ ] **Step 4**: Warte auf "Live" Status
- [ ] **Step 5**: Runtime Logs → "Skills loaded: 6" ✅
- [ ] **Step 6**: Test `/mcp` → 406 OK ✅
- [ ] **Step 7**: Web-App Settings → URL konfiguriert
- [ ] **Step 8**: Test "Welche Skills..." → Liste angezeigt
- [ ] **Step 9**: Test "Create presentation" → Routing funktioniert
- [ ] **Step 10**: Token-Einsparung verifiziert: ~90% ✅

---

## 📸 Screenshots der Schritte

### Schritt 1: App finden
```
DigitalOcean Dashboard → Apps → mcp-bus-suyns
```

### Schritt 2: Force Rebuild
```
Actions Dropdown (rechts oben) → Force Rebuild and Deploy
```

### Schritt 3: Runtime Logs
```
Runtime Logs Tab → Siehe Server-Ausgabe
```

---

## 🎯 Zusammenfassung

### Was du tun musst:

1. ✅ **Code ist gepusht** (Commit bbb60e4)
2. 👉 **Manuell rebuilden** in DigitalOcean
3. ⏳ **2-3 Minuten warten**
4. ✅ **Testen** in Web-App

### Was der Server macht:

- Lädt `skill-router.py`
- Startet FastMCP Server auf Port 8080
- Bietet 6 Skills über `/mcp` Endpoint
- Spart ~90% Tokens durch intelligentes Routing

---

**Nach Force Rebuild sollte alles funktionieren! 🚀**

Bei Fragen: Siehe Runtime Logs in DigitalOcean.
