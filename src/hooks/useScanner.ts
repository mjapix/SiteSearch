import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase, getEdgeFunctionUrl, getAuthHeaders } from '../lib/supabase';
import type { ScanSession, ScanMatch } from '../types/database';
import type { SearchOptions } from '../components/SearchForm';
import type { LogEntry } from '../components/ScanTerminal';

interface Match {
  position: number;
  url: string;
  title: string;
  contextSnippet: string;
  matchCount: number;
}

interface PreviewMatch {
  url: string;
  title: string;
  contextSnippet: string;
  matchCount: number;
}

export interface PreviewData {
  preview: {
    matches: PreviewMatch[];
    pagesChecked: number;
    hasMatches: boolean;
  };
  sitemapInfo: {
    usedSitemap: boolean;
    totalUrls: number;
    estimatedDurationSeconds: number;
  };
  queryParamWarning: string | null;
  remainingScans: number;
  query: string;
  targetUrl: string;
  options: SearchOptions;
}

interface ScanResult {
  sessionId: string;
  status: ScanSession['status'];
  totalPagesScanned: number;
  totalPagesFound: number;
  totalMatches: number;
  matches: Match[];
  query: string;
  targetUrl: string;
  durationSeconds: number | null;
  usedSitemap: boolean;
  sitemapPagesCount: number | null;
  effectiveUrl: string | null;
}

interface ScanProgress {
  pagesScanned: number;
  totalPages: number;
  matchesFound: number;
  currentUrl?: string;
}

type ScannerPhase = 'search' | 'preview' | 'scanning' | 'results';

interface UseScannerReturn {
  phase: ScannerPhase;
  isLoading: boolean;
  error: string | null;
  previewData: PreviewData | null;
  result: ScanResult | null;
  remainingScans: number | null;
  scanProgress: ScanProgress;
  logs: LogEntry[];
  startPreview: (query: string, targetUrl: string, options: SearchOptions) => Promise<void>;
  startFullScan: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  reset: () => void;
  backToSearch: () => void;
}

const SESSION_KEY = 'sitesearch_session';

let logIdCounter = 0;

function createLogEntry(type: LogEntry['type'], message: string): LogEntry {
  return {
    id: `log-${++logIdCounter}-${Date.now()}`,
    type,
    message,
    timestamp: new Date(),
  };
}

export function useScanner(): UseScannerReturn {
  const [phase, setPhase] = useState<ScannerPhase>('search');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [remainingScans, setRemainingScans] = useState<number | null>(null);

  useEffect(() => {
    fetch(getEdgeFunctionUrl('check-limit'), {
      method: 'GET',
      headers: getAuthHeaders(),
    })
      .then(res => res.json())
      .then(data => {
        if (typeof data.remainingScans === 'number') {
          setRemainingScans(data.remainingScans);
        }
      })
      .catch(() => {});
  }, []);

  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    pagesScanned: 0,
    totalPages: 0,
    matchesFound: 0,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, createLogEntry(type, message)]);
  }, []);

  const startPreview = useCallback(async (query: string, targetUrl: string, options: SearchOptions) => {
    setIsLoading(true);
    setError(null);
    setPreviewData(null);

    try {
      const response = await fetch(getEdgeFunctionUrl('preview-search'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          query,
          targetUrl,
          exactPhrase: options.exactPhrase,
          caseSensitive: options.caseSensitive,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Vorschau fehlgeschlagen');
      }

      setPreviewData(data);
      setRemainingScans(data.remainingScans);
      setPhase('preview');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ein unerwarteter Fehler ist aufgetreten';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startFullScan = useCallback(async () => {
    if (!previewData) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setLogs([]);
    setScanProgress({ pagesScanned: 0, totalPages: 0, matchesFound: 0 });
    setPhase('scanning');

    abortControllerRef.current = new AbortController();
    let sessionId: string | null = null;
    let completedViaEvent = false;
    const scanStartTime = Date.now();
    let effectiveUrl: string | null = null;

    try {
      addLog('info', 'Starte Scan...');

      const response = await fetch(getEdgeFunctionUrl('scan-website'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          query: previewData.query,
          targetUrl: previewData.targetUrl,
          maxPages: 200,
          exactPhrase: previewData.options.exactPhrase,
          caseSensitive: previewData.options.caseSensitive,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Scan fehlgeschlagen');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Stream nicht verfügbar');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.slice(6));

              switch (eventData.type) {
                case 'init':
                  addLog('success', eventData.message);
                  if (eventData.data?.sessionId) {
                    sessionId = eventData.data.sessionId;
                  }
                  break;
                case 'status':
                  addLog('info', eventData.message);
                  if (eventData.data?.phase === 'redirect' && eventData.data?.url) {
                    effectiveUrl = eventData.data.url as string;
                  }
                  break;
                case 'progress':
                  if (eventData.data) {
                    setScanProgress({
                      pagesScanned: eventData.data.pagesScanned || 0,
                      totalPages: eventData.data.totalPages || 0,
                      matchesFound: eventData.data.matchesFound || 0,
                      currentUrl: eventData.data.currentUrl,
                    });
                    if (eventData.data.skipped) {
                      addLog('info', eventData.message);
                    } else {
                      addLog('progress', eventData.message);
                    }
                  }
                  break;
                case 'match':
                  addLog('match', eventData.message);
                  if (eventData.data) {
                    setScanProgress(prev => ({
                      ...prev,
                      matchesFound: eventData.data.totalMatches || prev.matchesFound,
                    }));
                  }
                  break;
                case 'complete':
                  addLog('success', eventData.message);
                  if (eventData.data) {
                    completedViaEvent = true;
                    const durationSeconds = Math.round((Date.now() - scanStartTime) / 1000);
                    const scanResult: ScanResult = {
                      sessionId: eventData.data.sessionId,
                      status: 'completed',
                      totalPagesScanned: eventData.data.totalPagesScanned,
                      totalPagesFound: eventData.data.totalPagesScanned,
                      totalMatches: eventData.data.totalMatches,
                      matches: eventData.data.matches || [],
                      query: previewData.query,
                      targetUrl: previewData.targetUrl,
                      durationSeconds,
                      usedSitemap: !!(eventData.data.usedSitemap),
                      sitemapPagesCount: previewData.sitemapInfo.usedSitemap ? previewData.sitemapInfo.totalUrls : null,
                      effectiveUrl,
                    };
                    setResult(scanResult);
                    setRemainingScans(prev => prev !== null ? Math.max(0, prev - 1) : null);
                    setPhase('results');
                    localStorage.setItem(SESSION_KEY, eventData.data.sessionId);
                  }
                  break;
                case 'warning':
                  addLog('warning', eventData.message);
                  break;
                case 'error':
                  addLog('error', eventData.message);
                  throw new Error(eventData.message);
              }
            } catch (parseError) {
              if (parseError instanceof SyntaxError) {
                console.warn('Failed to parse SSE event:', line);
              } else {
                throw parseError;
              }
            }
          }
        }
      }

      if (!completedViaEvent && sessionId) {
        addLog('info', 'Verbindung unterbrochen – prüfe Ergebnis in Datenbank...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        const { data: session } = await supabase
          .from('scan_sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle();

        if (session && session.status === 'completed') {
          const { data: matches } = await supabase
            .from('scan_matches')
            .select('*')
            .eq('session_id', sessionId)
            .order('position', { ascending: true });

          const durationSeconds = Math.round((Date.now() - scanStartTime) / 1000);
          const scanResult: ScanResult = {
            sessionId: session.id,
            status: 'completed',
            totalPagesScanned: session.total_pages_scanned,
            totalPagesFound: session.total_pages_found,
            totalMatches: session.total_matches,
            matches: (matches || []).map((m: ScanMatch) => ({
              position: m.position,
              url: m.page_url,
              title: m.page_title || m.page_url,
              contextSnippet: m.context_snippet || '',
              matchCount: m.match_count,
            })),
            query: previewData.query,
            targetUrl: previewData.targetUrl,
            durationSeconds,
            usedSitemap: previewData.sitemapInfo.usedSitemap,
            sitemapPagesCount: previewData.sitemapInfo.usedSitemap ? previewData.sitemapInfo.totalUrls : null,
            effectiveUrl,
          };
          setResult(scanResult);
          setRemainingScans(prev => prev !== null ? Math.max(0, prev - 1) : null);
          setPhase('results');
          localStorage.setItem(SESSION_KEY, session.id);
          addLog('success', 'Ergebnisse erfolgreich geladen');
        } else if (session && session.status === 'crawling') {
          addLog('warning', 'Scan läuft noch – bitte Seite neu laden um Ergebnisse abzurufen');
        } else {
          addLog('error', 'Scan wurde unterbrochen und kein Ergebnis gefunden');
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        addLog('info', 'Scan abgebrochen');
        return;
      }
      const message = err instanceof Error ? err.message : 'Ein unerwarteter Fehler ist aufgetreten';
      addLog('error', message);

      if (sessionId && !completedViaEvent) {
        addLog('info', 'Prüfe ob Scan in Datenbank abgeschlossen wurde...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        const { data: session } = await supabase
          .from('scan_sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle();

        if (session && session.status === 'completed') {
          const { data: matches } = await supabase
            .from('scan_matches')
            .select('*')
            .eq('session_id', sessionId)
            .order('position', { ascending: true });

          const durationSeconds = Math.round((Date.now() - scanStartTime) / 1000);
          const scanResult: ScanResult = {
            sessionId: session.id,
            status: 'completed',
            totalPagesScanned: session.total_pages_scanned,
            totalPagesFound: session.total_pages_found,
            totalMatches: session.total_matches,
            matches: (matches || []).map((m: ScanMatch) => ({
              position: m.position,
              url: m.page_url,
              title: m.page_title || m.page_url,
              contextSnippet: m.context_snippet || '',
              matchCount: m.match_count,
            })),
            query: previewData.query,
            targetUrl: previewData.targetUrl,
            durationSeconds,
            usedSitemap: previewData.sitemapInfo.usedSitemap,
            sitemapPagesCount: previewData.sitemapInfo.usedSitemap ? previewData.sitemapInfo.totalUrls : null,
            effectiveUrl,
          };
          setResult(scanResult);
          setRemainingScans(prev => prev !== null ? Math.max(0, prev - 1) : null);
          setPhase('results');
          localStorage.setItem(SESSION_KEY, session.id);
          return;
        }
      }

      setError(message);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [previewData, addLog]);

  const loadSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: session, error: sessionError } = await supabase
        .from('scan_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();

      if (sessionError) throw sessionError;

      if (!session) {
        throw new Error('Session nicht gefunden oder abgelaufen');
      }

      const { data: matches, error: matchesError } = await supabase
        .from('scan_matches')
        .select('*')
        .eq('session_id', sessionId)
        .order('position', { ascending: true });

      if (matchesError) throw matchesError;

      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
      const lastViewed = session.last_viewed_at ? new Date(session.last_viewed_at) : null;

      if (!lastViewed || lastViewed < twelveHoursAgo) {
        const maxExpiry = new Date(new Date(session.created_at).getTime() + 7 * 24 * 60 * 60 * 1000);
        const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await supabase
          .from('scan_sessions')
          .update({
            expires_at: newExpiry < maxExpiry ? newExpiry.toISOString() : maxExpiry.toISOString(),
            last_viewed_at: new Date().toISOString(),
            view_count: session.view_count + 1,
          })
          .eq('id', sessionId);
      }

      const scanResult: ScanResult = {
        sessionId: session.id,
        status: session.status as ScanSession['status'],
        totalPagesScanned: session.total_pages_scanned,
        totalPagesFound: session.total_pages_found,
        totalMatches: session.total_matches,
        matches: (matches || []).map((m: ScanMatch) => ({
          position: m.position,
          url: m.page_url,
          title: m.page_title || m.page_url,
          contextSnippet: m.context_snippet || '',
          matchCount: m.match_count,
        })),
        query: session.query,
        targetUrl: session.target_url,
        durationSeconds: null,
        usedSitemap: false,
        sitemapPagesCount: null,
        effectiveUrl: null,
      };

      setResult(scanResult);
      setPhase('results');
      localStorage.setItem(SESSION_KEY, sessionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Laden der Session';
      setError(message);
      localStorage.removeItem(SESSION_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setPhase('search');
    setIsLoading(false);
    setError(null);
    setPreviewData(null);
    setResult(null);
    setLogs([]);
    setScanProgress({ pagesScanned: 0, totalPages: 0, matchesFound: 0 });
    localStorage.removeItem(SESSION_KEY);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const backToSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setPhase('search');
    setError(null);
    setPreviewData(null);
    setLogs([]);
    setScanProgress({ pagesScanned: 0, totalPages: 0, matchesFound: 0 });
  }, []);

  return {
    phase,
    isLoading,
    error,
    previewData,
    result,
    remainingScans,
    scanProgress,
    logs,
    startPreview,
    startFullScan,
    loadSession,
    reset,
    backToSearch,
  };
}

export function getSavedSessionId(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function getSessionFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('session');
}
