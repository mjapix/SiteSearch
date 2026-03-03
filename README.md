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
