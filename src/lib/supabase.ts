import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export function getEdgeFunctionUrl(functionName: string): string {
  return `${supabaseUrl}/functions/v1/${functionName}`;
}

const ADMIN_TOKEN_KEY = 'sitesearch_admin_token';
const CLIENT_ID_KEY = 'sitesearch_client_id';

export function getClientId(): string {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function isAdminMode(): boolean {
  return !!getAdminToken();
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${supabaseAnonKey}`,
    'Content-Type': 'application/json',
    'x-client-id': getClientId(),
  };
  const adminToken = getAdminToken();
  if (adminToken) {
    headers['x-admin-token'] = adminToken;
  }
  return headers;
}
