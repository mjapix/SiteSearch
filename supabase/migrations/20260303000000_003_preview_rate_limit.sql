/*
  # Preview Rate-Limiting

  Fügt zwei neue Spalten zur usage_limits-Tabelle hinzu,
  um Vorschau-Anfragen separat vom Vollscan-Limit zu zählen.

  ## Änderungen
  - `previews_today` (int, default 0) – Anzahl der Vorschauen heute
  - `preview_reset_at` (timestamptz) – Wann das Preview-Limit zurückgesetzt wird

  ## Limit
  - Vorschau-Limit: 20 pro Tag (5× das Scan-Limit)
  - Wird unabhängig vom Scan-Limit getrackt
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usage_limits' AND column_name = 'previews_today'
  ) THEN
    ALTER TABLE usage_limits ADD COLUMN previews_today int DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usage_limits' AND column_name = 'preview_reset_at'
  ) THEN
    ALTER TABLE usage_limits ADD COLUMN preview_reset_at timestamptz DEFAULT (NOW() + INTERVAL '24 hours');
  END IF;
END $$;
