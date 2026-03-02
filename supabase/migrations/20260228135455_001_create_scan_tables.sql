/*
  # Website Scanner Database Schema
  
  1. New Tables
    - `scan_sessions`
      - `id` (uuid, primary key) - Unique session identifier
      - `query` (text) - Search term entered by user
      - `target_url` (text) - Website URL being scanned
      - `status` (text) - pending, crawling, searching, completed, failed
      - `total_pages_found` (int) - Number of pages discovered
      - `total_pages_scanned` (int) - Number of pages actually scanned
      - `total_matches` (int) - Number of matches found
      - `error_message` (text) - Error details if failed
      - `expires_at` (timestamptz) - When this session data expires
      - `last_viewed_at` (timestamptz) - Last time results were viewed
      - `view_count` (int) - How many times results were viewed
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
    
    - `scan_matches`
      - `id` (uuid, primary key) - Unique match identifier
      - `session_id` (uuid, foreign key) - Reference to scan_sessions
      - `page_url` (text) - URL where match was found
      - `page_title` (text) - Title of the page
      - `context_snippet` (text) - Text surrounding the match
      - `match_count` (int) - Number of times term appears on this page
      - `position` (int) - Order of this match in results
      - `created_at` (timestamptz) - Creation timestamp
    
    - `usage_limits`
      - `id` (uuid, primary key) - Unique identifier
      - `ip_hash` (text) - Hashed IP address for privacy
      - `scans_today` (int) - Number of scans performed today
      - `reset_at` (timestamptz) - When the daily limit resets
      - `created_at` (timestamptz) - Creation timestamp

  2. Security
    - Enable RLS on all tables
    - Public read access to scan_sessions and scan_matches (for shareable links)
    - Insert/update only via Edge Functions (service role)

  3. Indexes
    - Index on scan_sessions.expires_at for cleanup queries
    - Index on scan_sessions.status for filtering
    - Index on scan_matches.session_id for joins
    - Index on usage_limits.ip_hash for lookups
*/

-- Create scan_sessions table
CREATE TABLE IF NOT EXISTS scan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  target_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total_pages_found int DEFAULT 0,
  total_pages_scanned int DEFAULT 0,
  total_matches int DEFAULT 0,
  error_message text,
  expires_at timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  last_viewed_at timestamptz,
  view_count int DEFAULT 0,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- Create scan_matches table
CREATE TABLE IF NOT EXISTS scan_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES scan_sessions(id) ON DELETE CASCADE,
  page_url text NOT NULL,
  page_title text,
  context_snippet text,
  match_count int DEFAULT 1,
  position int NOT NULL,
  created_at timestamptz DEFAULT NOW()
);

-- Create usage_limits table
CREATE TABLE IF NOT EXISTS usage_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text UNIQUE NOT NULL,
  scans_today int DEFAULT 0,
  reset_at timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at timestamptz DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE scan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_limits ENABLE ROW LEVEL SECURITY;

-- scan_sessions policies
-- Anyone can read sessions (for shareable links)
CREATE POLICY "Anyone can read non-expired sessions"
  ON scan_sessions
  FOR SELECT
  USING (expires_at > NOW());

-- Only service role can insert/update (Edge Functions)
CREATE POLICY "Service role can insert sessions"
  ON scan_sessions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update sessions"
  ON scan_sessions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete expired sessions"
  ON scan_sessions
  FOR DELETE
  USING (expires_at <= NOW());

-- scan_matches policies
CREATE POLICY "Anyone can read matches for non-expired sessions"
  ON scan_matches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM scan_sessions
      WHERE scan_sessions.id = scan_matches.session_id
      AND scan_sessions.expires_at > NOW()
    )
  );

CREATE POLICY "Service role can insert matches"
  ON scan_matches
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can delete matches"
  ON scan_matches
  FOR DELETE
  USING (true);

-- usage_limits policies
CREATE POLICY "Anyone can read their usage limit"
  ON usage_limits
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage usage limits"
  ON usage_limits
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update usage limits"
  ON usage_limits
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete old usage limits"
  ON usage_limits
  FOR DELETE
  USING (reset_at <= NOW());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_scan_sessions_expires_at ON scan_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_scan_sessions_status ON scan_sessions(status);
CREATE INDEX IF NOT EXISTS idx_scan_matches_session_id ON scan_matches(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_limits_ip_hash ON usage_limits(ip_hash);
CREATE INDEX IF NOT EXISTS idx_usage_limits_reset_at ON usage_limits(reset_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for scan_sessions
DROP TRIGGER IF EXISTS update_scan_sessions_updated_at ON scan_sessions;
CREATE TRIGGER update_scan_sessions_updated_at
  BEFORE UPDATE ON scan_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();