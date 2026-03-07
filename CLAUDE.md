# CLAUDE.md — SiteSearch

Diese Datei beschreibt den aktuellen Projektzustand und notwendige Schritte nach einem Merge oder Deployment.

---

## Projekt-Kurzübersicht

SiteSearch ist ein Website-Crawler mit drei Supabase Edge Functions:

| Function | Zweck |
|----------|-------|
| `scan-website` | Vollständiger Crawl mit SSE-Streaming (bis 200 Seiten) |
| `preview-search` | Schnelle Vorschau (max. 3 Seiten, kein Stream) |
| `check-limit` | Rate-Limit-Status abfragen |

Rate-Limiting läuft über die `usage_limits`-Tabelle in Supabase (per Browser-UUID oder IP-Hash).

---

## Nach Merge: Was muss gemacht werden?

### SQL-Migrationen

**Keine neue Migration erforderlich.**

Alle drei vorhandenen Migrationen sind weiterhin aktuell:

| Datei | Status |
|-------|--------|
| `supabase/migrations/20260228135455_001_create_scan_tables.sql` | bereits ausgeführt |
| `supabase/migrations/20260301150724_002_usage_limits_client_id.sql` | bereits ausgeführt |
| `supabase/migrations/20260303000000_003_preview_rate_limit.sql` | bereits ausgeführt |

Wer das Projekt **zum ersten Mal** einrichtet, muss alle drei in dieser Reihenfolge im Supabase SQL Editor ausführen. Wer bereits eine laufende Instanz hat, überspringt diesen Schritt.

---

### Edge Functions neu deployen — PFLICHT

Die Edge Functions wurden geändert und **müssen neu deployed werden**, damit die Sicherheits-Fixes aktiv sind:

```bash
supabase functions deploy scan-website
supabase functions deploy preview-search
supabase functions deploy check-limit
```

> Ohne Redeploy laufen weiterhin die alten, unsicheren Versionen.

---

## Was wurde zuletzt geändert?

Zweiter Security-Fix-Durchlauf (2026-03-07) — vier Lücken in den Edge Functions behoben:

| Lücke | Betroffene Dateien |
|-------|--------------------|
| SSRF via Open Redirect: `response.url` nach Redirects nicht geprüft | `scan-website`, `preview-search` |
| Rate-Limit-Bypass: `x-forwarded-for` war spoofbar | alle 3 Functions |
| Sitemap als Web-Proxy: `<loc>`-URLs aus fremden Domains akzeptiert | `scan-website`, `preview-search` |
| Memory Exhaustion: HTTP-Antwortgröße unbegrenzt | `scan-website`, `preview-search` |

Keine Datenbankänderungen — ausschließlich Code in den Edge Functions.

Details mit Code-Snippets: siehe `README.md` → Abschnitt **Behobene Sicherheitslücken**.

---

## Umgebungsvariablen (Edge Functions)

Im Supabase Dashboard → Edge Functions → Manage secrets:

| Variable | Beschreibung |
|----------|-------------|
| `ADMIN_SECRET` | Token für Admin-Modus (Scan-Limit aufheben) |
| `ALLOWED_ORIGIN` | CORS-Origin, z.B. `https://deine-app.bolt.new` |

---

## Frontend-Umgebungsvariablen

```env
VITE_SUPABASE_URL=https://DEIN-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

In Bolt: Einstellungen → Environment → Variablen eintragen.

---

## Lokale Entwicklung

```bash
npm install
npm run dev
# → http://localhost:5173
```
