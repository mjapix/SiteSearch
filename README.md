# SiteSearch

Website-Inhalte gezielt durchsuchen — crawlt Seiten (oder XML-Sitemaps) und gibt Treffer mit Kontext-Snippets zurück.

---

## Projekt in Bolt importieren

1. bolt.new öffnen
2. URL direkt eingeben: `bolt.new/github.com/mjapix/SiteSearch`
   — oder über **Import from GitHub** → `https://github.com/mjapix/SiteSearch`
3. Branch wählen (z.B. `main`)
4. Weiter mit Schritt **Frontend-Umgebungsvariablen** unten

---

## Voraussetzungen

- [Supabase](https://supabase.com) Projekt (kostenloser Free-Tier reicht)
- Node.js 18+ (nur für lokale Entwicklung)

---

## 1. Supabase einrichten

### 1a. Datenbank-Migrationen ausführen

Im Supabase Dashboard → **SQL Editor** — folgende Migrations in dieser Reihenfolge ausführen:

| Datei | Beschreibung |
|-------|-------------|
| `supabase/migrations/20260228135455_001_create_scan_tables.sql` | Grundschema: scan_sessions, scan_matches, usage_limits |
| `supabase/migrations/20260301150724_002_usage_limits_client_id.sql` | client_id-Spalte für browserbasiertes Rate-Limiting |
| `supabase/migrations/20260303000000_003_preview_rate_limit.sql` | previews_today + preview_reset_at für Preview-Ratelimit |

> **Tipp:** Inhalt der Datei kopieren → im SQL-Editor einfügen → **Run** klicken.

### 1b. Edge Functions deployen

```bash
# Supabase CLI installieren (falls nicht vorhanden)
npm install -g supabase

# Login
supabase login

# Projekt verknüpfen (Project-ID im Supabase Dashboard unter Settings → General)
supabase link --project-ref DEINE_PROJECT_ID

# Alle drei Edge Functions deployen
supabase functions deploy scan-website
supabase functions deploy preview-search
supabase functions deploy check-limit
```

### 1c. Edge Function Umgebungsvariablen setzen

Im Supabase Dashboard → **Edge Functions** → **Manage secrets**:

| Variable | Wert | Beschreibung |
|----------|------|-------------|
| `ADMIN_SECRET` | Eigenes sicheres Passwort | Token für den Admin-Modus (Scan-Limit aufheben) |
| `ALLOWED_ORIGIN` | z.B. `https://deine-app.bolt.new` | Erlaubte CORS-Origin — leer lassen für `*` (alle) |

> **Sicherheitshinweis:** `ALLOWED_ORIGIN` auf deine tatsächliche App-URL setzen, sobald die Produktions-URL bekannt ist.

---

## 2. Frontend-Umgebungsvariablen

### In Bolt

Bolt → **Environment** (Zahnrad-Symbol) → folgende Variablen eintragen:

```
VITE_SUPABASE_URL=https://DEIN-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### Lokal (`.env`-Datei)

```bash
cp .env.example .env
```

`.env` befüllen:

```env
VITE_SUPABASE_URL=https://DEIN-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

> **Wo finde ich die Werte?**
> Supabase Dashboard → **Settings** → **API**:
> - `Project URL` → `VITE_SUPABASE_URL`
> - `anon public` Key → `VITE_SUPABASE_ANON_KEY`

---

## 3. Lokale Entwicklung

```bash
npm install
npm run dev
```

App läuft unter `http://localhost:5173`.

---

## Admin-Modus

Der Admin-Modus hebt das tägliche Scan-Limit auf.

1. In der App oben rechts auf das **Schild-Symbol** klicken
2. Den `ADMIN_SECRET` aus Schritt 1c eingeben
3. Token läuft automatisch nach **4 Stunden** ab

---

## Limits (Standard)

| Typ | Limit | Zeitraum |
|-----|-------|----------|
| Vollständige Scans | 4 | pro Tag |
| Vorschauen | 20 | pro Tag |
| Max. Seiten pro Scan | 200 | pro Scan |
| Suchbegriff | 2–500 Zeichen | — |
| Ziel-URL | max. 2048 Zeichen | — |

---

## Projektstruktur

```
src/
├── components/       # UI-Komponenten
├── hooks/
│   └── useScanner.ts # Gesamte Business-Logik
├── lib/
│   └── supabase.ts   # Supabase-Client + Auth-Helpers
└── types/
    └── database.ts   # TypeScript-Typen

supabase/
├── functions/
│   ├── scan-website/    # Haupt-Crawler (SSE-Streaming)
│   ├── preview-search/  # Schnelle Vorschau
│   └── check-limit/     # Rate-Limit-Abfrage
└── migrations/          # SQL-Schemas (in Reihenfolge ausführen)
```

---

## Sicherheitshinweise

- **CORS:** `ALLOWED_ORIGIN` in Supabase auf deine App-Domain einschränken
- **Admin-Token:** Sicheres, zufälliges Passwort wählen (min. 20 Zeichen empfohlen)
- **Migrations:** Alle drei Migrations müssen ausgeführt sein, sonst funktioniert das Preview-Rate-Limiting nicht
- **Secrets:** `.env`-Datei niemals ins Git-Repository committen

---

## Behobene Sicherheitslücken

Dieser Abschnitt dokumentiert alle Schwachstellen, die im Rahmen einer Security-Analyse identifiziert und behoben wurden.

---

### KRITISCH

#### SSRF — Server-Side Request Forgery
**Behoben in:** `supabase/functions/scan-website/index.ts`, `supabase/functions/preview-search/index.ts`

**Problem:** Die Edge Functions haben beliebige User-URLs ohne Validierung gefetcht. Ein Angreifer konnte damit interne Dienste anscannen, z.B.:
- `http://169.254.169.254/latest/meta-data/` → AWS-Zugangsdaten
- `http://192.168.1.1/admin` → Internes Netzwerk
- `http://localhost:5432` → Datenbankports

**Fix:** Funktion `isSafeUrl()` blockiert jetzt vor jedem `fetch()`-Aufruf:
- Nur `http://` und `https://` erlaubt
- Geblockt: `localhost`, `0.0.0.0`, `::1`
- Geblockt: Private IP-Ranges (`10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`, `127.x.x.x`)
- Geblockt: Cloud-Metadata-Endpoints (`169.254.169.254`, `metadata.google.internal`)

---

### HOCH

#### CORS — Wildcard-Origin
**Behoben in:** Allen 3 Edge Functions

**Problem:** `Access-Control-Allow-Origin: *` erlaubte jeder beliebigen Website, Requests an die API zu senden — kombiniert mit einem gestohlenen Admin-Token war ein CSRF-Angriff möglich.

**Fix:** Origin wird jetzt aus der Umgebungsvariable `ALLOWED_ORIGIN` gelesen. Wenn gesetzt, werden nur Requests von dieser Domain akzeptiert.

---

#### Fehlende Security Headers
**Behoben in:** Allen 3 Edge Functions

**Problem:** Responses enthielten keine HTTP-Sicherheitsheader, was Clickjacking und MIME-Sniffing ermöglichte.

**Fix:** Alle Responses senden jetzt:
| Header | Wert | Schutz vor |
|--------|------|-----------|
| `X-Content-Type-Options` | `nosniff` | MIME-Sniffing |
| `X-Frame-Options` | `DENY` | Clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer-Leakage |

---

#### Interne Fehlermeldungen nach außen
**Behoben in:** Allen 3 Edge Functions

**Problem:** `error.message` wurde direkt an den Client zurückgegeben und konnte interne Stack-Informationen, Dateinamen oder Datenbankdetails preisgeben.

**Fix:** Alle Catch-Blöcke geben jetzt nur generische Texte zurück (`"Ein unerwarteter Fehler ist aufgetreten"`). Der vollständige Fehler wird nur server-seitig geloggt.

---

### MITTEL

#### Input-Validierung fehlend
**Behoben in:** `scan-website`, `preview-search` (Server), `SearchForm.tsx` (Client)

**Problem:** Keine Längenprüfung auf Query und URL — extrem lange Eingaben konnten zu ReDoS (Regex Denial of Service) oder überlasteten Requests führen.

**Fix:**
- Suchbegriff: min. 2 Zeichen, max. 500 Zeichen
- Ziel-URL: max. 2048 Zeichen
- Frontend: Button deaktiviert bei Unterschreitung, Fehlermeldung im UI
- Server: HTTP 400 bei Verletzung der Grenzen

---

#### IP-Hash auf 32 Zeichen abgeschnitten
**Behoben in:** Allen 3 Edge Functions

**Problem:** Der SHA-256-Hash (64 Hex-Zeichen) wurde auf 32 Zeichen gekürzt — das erhöht die Kollisionswahrscheinlichkeit und könnte zwei verschiedene IPs auf denselben Hash mappen (Rate-Limit-Bypass).

**Fix:** Vollständiger 64-Zeichen SHA-256-Hash wird verwendet.

---

#### Admin-Token ohne Ablaufzeit
**Behoben in:** `src/lib/supabase.ts`

**Problem:** Der Admin-Token wurde als Plain-Text dauerhaft in `localStorage` gespeichert — kein Ablaufdatum, kein Schutz gegen langlebige Token-Diebstähle.

**Fix:** Token wird als JSON-Objekt `{ token, expiresAt }` gespeichert und läuft automatisch nach **4 Stunden** ab. Abgelaufene Token werden beim nächsten Lesen automatisch gelöscht.

---

#### Preview-Endpoint ohne Rate-Limiting
**Behoben in:** `supabase/functions/preview-search/index.ts`, Migration `003`

**Problem:** Der `/preview-search`-Endpunkt hatte kein Limit — ein Angreifer konnte beliebig viele Vorschauen starten und damit Server-Ressourcen (CPU, Bandbreite, Supabase-Quota) ausschöpfen.

**Fix:**
- Neues DB-Schema: Spalten `previews_today` und `preview_reset_at` in `usage_limits`
- Limit: max. **20 Vorschauen pro Tag** pro Client (5× das Scan-Limit)
- HTTP 429 bei Überschreitung
- Neue Nutzer bekommen beim ersten Preview automatisch einen Datensatz angelegt

---

### Bekannte offene Punkte

Folgende Risiken wurden bewusst nicht geändert, da sie entweder Design-Entscheidungen sind oder tiefgreifende Refactorings erfordern:

| Risiko | Grund offen |
|--------|------------|
| Admin-Token in `localStorage` (nicht verschlüsselt) | Erfordert komplettes Auth-System (z.B. Supabase Auth mit httpOnly-Cookies) |
| Rate-Limit via Client-UUID umgehbar | Bewusstes Design: Nutzer im selben Netzwerk sollen eigene Limits haben (Migration 002) |
| Scan-Sessions ohne Eigentümer-Prüfung lesbar | Intentionales Feature für die Ergebnis-Sharing-Funktion |
