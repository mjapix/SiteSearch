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
const ADMIN_TOKEN_EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 Stunden

interface StoredAdminToken {
  token: string;
  expiresAt: number;
}

export function getClientId(): string {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

export function getAdminToken(): string | null {
  try {
    const raw = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!raw) return null;
    const stored: StoredAdminToken = JSON.parse(raw);
    if (Date.now() > stored.expiresAt) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      return null;
    }
    return stored.token;
  } catch {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    return null;
  }
}

export function setAdminToken(token: string): void {
  const stored: StoredAdminToken = {
    token,
    expiresAt: Date.now() + ADMIN_TOKEN_EXPIRY_MS,
  };
  localStorage.setItem(ADMIN_TOKEN_KEY, JSON.stringify(stored));
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
