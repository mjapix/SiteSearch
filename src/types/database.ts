export interface Database {
  public: {
    Tables: {
      scan_sessions: {
        Row: {
          id: string;
          query: string;
          target_url: string;
          status: 'pending' | 'crawling' | 'searching' | 'completed' | 'failed';
          total_pages_found: number;
          total_pages_scanned: number;
          total_matches: number;
          error_message: string | null;
          expires_at: string;
          last_viewed_at: string | null;
          view_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          query: string;
          target_url: string;
          status?: string;
          total_pages_found?: number;
          total_pages_scanned?: number;
          total_matches?: number;
          error_message?: string;
          expires_at?: string;
          last_viewed_at?: string;
          view_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          query?: string;
          target_url?: string;
          status?: string;
          total_pages_found?: number;
          total_pages_scanned?: number;
          total_matches?: number;
          error_message?: string;
          expires_at?: string;
          last_viewed_at?: string;
          view_count?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      scan_matches: {
        Row: {
          id: string;
          session_id: string;
          page_url: string;
          page_title: string | null;
          context_snippet: string | null;
          match_count: number;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          page_url: string;
          page_title?: string;
          context_snippet?: string;
          match_count?: number;
          position: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          page_url?: string;
          page_title?: string;
          context_snippet?: string;
          match_count?: number;
          position?: number;
          created_at?: string;
        };
      };
      usage_limits: {
        Row: {
          id: string;
          ip_hash: string;
          scans_today: number;
          reset_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ip_hash: string;
          scans_today?: number;
          reset_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          ip_hash?: string;
          scans_today?: number;
          reset_at?: string;
          created_at?: string;
        };
      };
    };
  };
}

export type ScanSession = Database['public']['Tables']['scan_sessions']['Row'];
export type ScanMatch = Database['public']['Tables']['scan_matches']['Row'];
export type UsageLimit = Database['public']['Tables']['usage_limits']['Row'];
