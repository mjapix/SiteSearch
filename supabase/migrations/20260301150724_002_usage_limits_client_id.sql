/*
  # Migrate usage_limits to use client_id instead of ip_hash

  ## Summary
  Switches the rate limiting key from server-side IP hash to a browser-generated
  client ID (UUID stored in localStorage). This ensures limits are tracked per
  user/browser rather than per IP address, so multiple users sharing the same
  network (home, office) each get their own independent daily scan quota.

  ## Changes
  1. `usage_limits` table
     - Add column `client_id` (text, unique) – the browser-generated UUID
     - Keep `ip_hash` column temporarily (nullable) for backwards compatibility
     - New unique index on `client_id`
     - Old unique index on `ip_hash` remains

  ## Notes
  - Existing rows (keyed by ip_hash) are preserved but will no longer be matched
    once the Edge Functions switch to client_id lookups
  - The ip_hash column is kept nullable so old rows don't violate constraints
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usage_limits' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE usage_limits ADD COLUMN client_id text;
  END IF;
END $$;

ALTER TABLE usage_limits ALTER COLUMN ip_hash DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_limits_client_id ON usage_limits(client_id) WHERE client_id IS NOT NULL;
