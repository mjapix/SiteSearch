import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-admin-token, x-client-id",
};

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

interface ScanRequest {
  query: string;
  targetUrl: string;
  maxPages?: number;
  exactPhrase?: boolean;
  caseSensitive?: boolean;
}

interface PageMatch {
  url: string;
  title: string;
  contextSnippet: string;
  matchCount: number;
}

interface SitemapResult {
  urls: string[];
  isSitemap: boolean;
}

interface ProgressEvent {
  type: 'init' | 'progress' | 'match' | 'status' | 'complete' | 'error' | 'warning';
  message?: string;
  data?: Record<string, unknown>;
}

const MAX_PAGES_DEFAULT = 50;
const MAX_PAGES_LIMIT = 200;
const CRAWL_TIMEOUT = 5000;
const DAILY_SCAN_LIMIT = 4;

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    let path = parsed.pathname;
    if (path.endsWith('/') && path !== '/') {
      path = path.slice(0, -1);
    }
    parsed.pathname = path;
    return parsed.toString();
  } catch {
    return url;
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const h = parsed.hostname.toLowerCase();
    if (h === 'localhost' || h === '0.0.0.0' || h === '::1') return false;
    if (h === '169.254.169.254' || h === 'metadata.google.internal' || h === 'metadata.goog') return false;
    if (/^127\./.test(h)) return false;
    if (/^10\./.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    if (/^192\.168\./.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

function extractContextSnippet(text: string, query: string, caseSensitive: boolean, maxLength = 300): string {
  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();
  const index = searchText.indexOf(searchQuery);

  if (index === -1) return '';

  const contextBefore = 100;
  const contextAfter = 150;
  const start = Math.max(0, index - contextBefore);
  const end = Math.min(text.length, index + query.length + contextAfter);

  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';

  return snippet.slice(0, maxLength);
}

function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return titleMatch ? titleMatch[1].trim() : '';
}

function extractText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLinks(html: string, baseUrl: string, targetDomain: string): string[] {
  const links: string[] = [];
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const href = match[1];
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
        continue;
      }

      const absoluteUrl = new URL(href, baseUrl).toString();
      const linkDomain = extractDomain(absoluteUrl);

      if (linkDomain === targetDomain) {
        links.push(normalizeUrl(absoluteUrl));
      }
    } catch {
      continue;
    }
  }

  return [...new Set(links)];
}

async function fetchPage(url: string, allowText = false): Promise<{ html: string; ok: boolean; finalUrl: string }> {
  if (!isSafeUrl(url)) {
    return { html: '', ok: false, finalUrl: url };
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CRAWL_TIMEOUT);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SiteSearchBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml,text/plain',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { html: '', ok: false, finalUrl: url };
    }

    const contentType = response.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml') || contentType.includes('application/xml');
    const isText = contentType.includes('text/plain');

    if (!isHtml && !(allowText && isText)) {
      return { html: '', ok: false, finalUrl: response.url };
    }

    const html = await response.text();
    return { html, ok: true, finalUrl: normalizeUrl(response.url) };
  } catch {
    return { html: '', ok: false, finalUrl: url };
  }
}

async function parseSitemap(url: string, domain: string, maxDepth = 2): Promise<SitemapResult> {
  if (maxDepth <= 0) return { urls: [], isSitemap: false };

  try {
    const { html, ok } = await fetchPage(url);
    if (!ok) return { urls: [], isSitemap: false };

    if (html.includes('<urlset') || html.includes('<sitemapindex')) {
      const urls: string[] = [];
      const locRegex = /<loc>([^<]+)<\/loc>/gi;
      let match;

      while ((match = locRegex.exec(html)) !== null) {
        const loc = match[1].trim();
        if (loc.endsWith('.xml')) {
          const nestedResult = await parseSitemap(loc, domain, maxDepth - 1);
          urls.push(...nestedResult.urls);
        } else {
          urls.push(normalizeUrl(loc));
        }
      }

      return { urls: [...new Set(urls)], isSitemap: true };
    }

    return { urls: [], isSitemap: false };
  } catch {
    return { urls: [], isSitemap: false };
  }
}

async function findSitemapsFromRobotsTxt(domain: string): Promise<string[]> {
  try {
    const robotsUrl = `https://${domain}/robots.txt`;
    const { html, ok } = await fetchPage(robotsUrl, true);
    if (!ok) return [];

    const sitemapUrls: string[] = [];
    const lines = html.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim().toLowerCase();
      if (trimmedLine.startsWith('sitemap:')) {
        const sitemapUrl = line.trim().substring(8).trim();
        if (sitemapUrl) {
          sitemapUrls.push(sitemapUrl);
        }
      }
    }

    return sitemapUrls;
  } catch {
    return [];
  }
}

function getCommonSitemapPaths(domain: string): string[] {
  return [
    `https://${domain}/sitemap.xml`,
    `https://${domain}/sitemap_index.xml`,
    `https://${domain}/sitemap-index.xml`,
    `https://${domain}/sitemap/sitemap.xml`,
    `https://${domain}/sitemaps/sitemap.xml`,
    `https://${domain}/sitemap/index.xml`,
    `https://${domain}/wp-sitemap.xml`,
    `https://${domain}/post-sitemap.xml`,
    `https://${domain}/page-sitemap.xml`,
  ];
}


async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + 'salt-for-privacy');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getUsageRecord(supabase: ReturnType<typeof createClient>, clientId: string | null, ipHash: string) {
  if (clientId && clientId.length > 8) {
    const { data } = await supabase.from('usage_limits').select('*').eq('client_id', clientId).maybeSingle();
    return { data, isClientBased: true };
  }
  const { data } = await supabase.from('usage_limits').select('*').eq('ip_hash', ipHash).maybeSingle();
  return { data, isClientBased: false };
}

function hasQueryParams(url: string): boolean {
  try {
    return new URL(url).search !== '';
  } catch {
    return false;
  }
}

function sendEvent(controller: ReadableStreamDefaultController, event: ProgressEvent) {
  const data = JSON.stringify(event);
  controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: { ...corsHeaders, ...securityHeaders },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const adminToken = req.headers.get('x-admin-token');
    const adminSecret = Deno.env.get('ADMIN_SECRET');
    const isAdmin = adminSecret && adminToken === adminSecret;

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] ||
                     req.headers.get('cf-connecting-ip') ||
                     'unknown';
    const ipHash = await hashIp(clientIp);
    const clientId = req.headers.get('x-client-id');

    if (!isAdmin) {
      const { data: usageData, isClientBased } = await getUsageRecord(supabase, clientId, ipHash);
      const resetAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      if (usageData) {
        if (new Date(usageData.reset_at) <= new Date()) {
          const updateKey = isClientBased ? { client_id: clientId } : { ip_hash: ipHash };
          await supabase.from('usage_limits').update({ scans_today: 1, reset_at: resetAt }).match(updateKey);
        } else if (usageData.scans_today >= DAILY_SCAN_LIMIT) {
          return new Response(
            JSON.stringify({
              error: 'Taegliches Limit erreicht',
              message: `Du hast dein taegliches Limit von ${DAILY_SCAN_LIMIT} Scans erreicht. Versuche es morgen erneut.`,
              resetAt: usageData.reset_at,
            }),
            { status: 429, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          const updateKey = isClientBased ? { client_id: clientId } : { ip_hash: ipHash };
          await supabase.from('usage_limits').update({ scans_today: usageData.scans_today + 1 }).match(updateKey);
        }
      } else {
        if (isClientBased) {
          await supabase.from('usage_limits').insert({ client_id: clientId, scans_today: 1, reset_at: resetAt });
        } else {
          await supabase.from('usage_limits').insert({ ip_hash: ipHash, scans_today: 1, reset_at: resetAt });
        }
      }
    }

    const body: ScanRequest = await req.json();
    const {
      query,
      targetUrl,
      maxPages = MAX_PAGES_DEFAULT,
      exactPhrase = true,
      caseSensitive = false,
    } = body;

    if (!query || !targetUrl) {
      return new Response(
        JSON.stringify({ error: 'Fehlende Pflichtfelder: query und targetUrl' }),
        {
          status: 400,
          headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (query.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'Suchbegriff muss mindestens 2 Zeichen lang sein' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (query.length > 500) {
      return new Response(
        JSON.stringify({ error: 'Suchbegriff zu lang (max. 500 Zeichen)' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (targetUrl.length > 2048) {
      return new Response(
        JSON.stringify({ error: 'URL zu lang (max. 2048 Zeichen)' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let normalizedTargetUrl = targetUrl;
          if (!normalizedTargetUrl.startsWith('http://') && !normalizedTargetUrl.startsWith('https://')) {
            normalizedTargetUrl = 'https://' + normalizedTargetUrl;
          }

          sendEvent(controller, {
            type: 'status',
            message: 'Verbindung wird hergestellt...',
            data: { phase: 'connecting' }
          });

          const { html: _redirectHtml, ok: redirectOk, finalUrl } = await fetchPage(normalizedTargetUrl);
          if (redirectOk && finalUrl !== normalizedTargetUrl) {
            normalizedTargetUrl = finalUrl;
            sendEvent(controller, {
              type: 'status',
              message: `Weiterleitung zu ${new URL(finalUrl).hostname}`,
              data: { phase: 'redirect', url: finalUrl }
            });
          }

          const targetDomain = extractDomain(normalizedTargetUrl);
          if (!targetDomain) {
            sendEvent(controller, { type: 'error', message: 'Ungueltige URL' });
            controller.close();
            return;
          }

          const effectiveMaxPages = Math.min(maxPages, MAX_PAGES_LIMIT);

          const { data: session, error: sessionError } = await supabase
            .from('scan_sessions')
            .insert({
              query,
              target_url: normalizedTargetUrl,
              status: 'crawling',
            })
            .select()
            .single();

          if (sessionError || !session) {
            sendEvent(controller, { type: 'error', message: 'Fehler beim Erstellen der Scan-Session' });
            controller.close();
            return;
          }

          sendEvent(controller, {
            type: 'init',
            message: 'Scan gestartet',
            data: { sessionId: session.id, domain: targetDomain }
          });

          const isSitemapUrl = normalizedTargetUrl.toLowerCase().includes('sitemap') &&
                               normalizedTargetUrl.toLowerCase().endsWith('.xml');

          let urlsToScan: string[] = [];
          let usedSitemap = false;
          let sitemapSource = '';

          sendEvent(controller, {
            type: 'status',
            message: 'Suche nach Sitemap...',
            data: { phase: 'sitemap_search' }
          });

          if (isSitemapUrl) {
            sendEvent(controller, {
              type: 'status',
              message: `Lade Sitemap: ${normalizedTargetUrl}`,
              data: { phase: 'loading_sitemap' }
            });
            const sitemapResult = await parseSitemap(normalizedTargetUrl, targetDomain);
            if (sitemapResult.isSitemap && sitemapResult.urls.length > 0) {
              urlsToScan = sitemapResult.urls;
              usedSitemap = true;
              sitemapSource = normalizedTargetUrl;
              sendEvent(controller, {
                type: 'status',
                message: `Sitemap geparst: ${sitemapResult.urls.length} URLs gefunden`,
                data: { phase: 'sitemap_parsed', count: sitemapResult.urls.length }
              });
            } else {
              sendEvent(controller, {
                type: 'status',
                message: 'Sitemap leer oder nicht lesbar – wechsle zu Crawling',
                data: { phase: 'sitemap_empty' }
              });
            }
          }

          if (!usedSitemap) {
            sendEvent(controller, {
              type: 'status',
              message: 'Pruefe robots.txt...',
              data: { phase: 'checking_robots' }
            });
            const robotsSitemaps = await findSitemapsFromRobotsTxt(targetDomain);

            if (robotsSitemaps.length > 0) {
              sendEvent(controller, {
                type: 'status',
                message: `${robotsSitemaps.length} Sitemap(s) in robots.txt gefunden`,
                data: { phase: 'found_robots_sitemaps', count: robotsSitemaps.length }
              });
              for (const sitemapUrl of robotsSitemaps) {
                sendEvent(controller, {
                  type: 'status',
                  message: `Lade: ${sitemapUrl}`,
                  data: { phase: 'loading_sitemap' }
                });
                const sitemapResult = await parseSitemap(sitemapUrl, targetDomain);
                if (sitemapResult.isSitemap && sitemapResult.urls.length > 0) {
                  urlsToScan.push(...sitemapResult.urls);
                  usedSitemap = true;
                  sitemapSource = sitemapUrl;
                  sendEvent(controller, {
                    type: 'status',
                    message: `${sitemapUrl}: ${sitemapResult.urls.length} URLs geladen`,
                    data: { phase: 'sitemap_loaded', count: sitemapResult.urls.length }
                  });
                }
              }
              urlsToScan = [...new Set(urlsToScan)];
              if (usedSitemap) {
                sendEvent(controller, {
                  type: 'status',
                  message: `Gesamt nach Deduplizierung: ${urlsToScan.length} URLs`,
                  data: { phase: 'dedup_complete', count: urlsToScan.length }
                });
              }
            }

            if (!usedSitemap) {
              sendEvent(controller, {
                type: 'status',
                message: 'Pruefe Standard-Sitemap-Pfade...',
                data: { phase: 'checking_common_paths' }
              });
              const commonSitemapUrls = getCommonSitemapPaths(targetDomain);

              for (const sitemapUrl of commonSitemapUrls) {
                const sitemapResult = await parseSitemap(sitemapUrl, targetDomain);
                if (sitemapResult.isSitemap && sitemapResult.urls.length > 0) {
                  urlsToScan = sitemapResult.urls;
                  usedSitemap = true;
                  sitemapSource = sitemapUrl;
                  sendEvent(controller, {
                    type: 'status',
                    message: `Sitemap gefunden: ${sitemapUrl} (${sitemapResult.urls.length} URLs)`,
                    data: { phase: 'sitemap_found', url: sitemapUrl, count: sitemapResult.urls.length }
                  });
                  break;
                }
              }
            }
          }

          const totalPages = usedSitemap
            ? Math.min(urlsToScan.length, effectiveMaxPages)
            : effectiveMaxPages;

          if (usedSitemap) {
            const limited = urlsToScan.length > effectiveMaxPages;
            sendEvent(controller, {
              type: 'success',
              message: limited
                ? `Sitemap: ${urlsToScan.length} URLs gefunden – scanne die ersten ${effectiveMaxPages}`
                : `Sitemap: ${urlsToScan.length} URLs gefunden – alle werden gescannt`,
              data: { phase: 'urls_found', count: urlsToScan.length, total: totalPages, source: sitemapSource }
            });
          } else {
            sendEvent(controller, {
              type: 'status',
              message: `Keine Sitemap gefunden – starte Crawling (max. ${effectiveMaxPages} Seiten)`,
              data: { phase: 'crawling_mode' }
            });
          }

          const visited = new Set<string>();
          const matches: PageMatch[] = [];
          const regexFlags = caseSensitive ? 'g' : 'gi';
          const queryRegex = new RegExp(escapeRegex(query), regexFlags);
          let queryParamWarningShown = false;

          sendEvent(controller, {
            type: 'progress',
            message: 'Starte Seitenanalyse...',
            data: {
              pagesScanned: 0,
              totalPages,
              matchesFound: 0,
              phase: 'scanning'
            }
          });

          if (usedSitemap) {
            const urlsToProcess = urlsToScan.slice(0, effectiveMaxPages);

            await supabase
              .from('scan_sessions')
              .update({
                total_pages_found: urlsToProcess.length,
              })
              .eq('id', session.id);

            let scannedCount = 0;

            for (const url of urlsToProcess) {
              if (visited.has(url)) continue;

              if (!queryParamWarningShown && hasQueryParams(url)) {
                queryParamWarningShown = true;
                sendEvent(controller, {
                  type: 'warning',
                  message: `Hinweis: Einige URLs enthalten Query-Parameter (z.B. ${new URL(url).search}). Seiten mit gleichen Inhalten aber unterschiedlichen Parametern werden nicht als Duplikate erkannt und koennen mehrfach gescannt werden.`,
                  data: { url }
                });
              }

              const shortUrl = url.replace(/^https?:\/\/[^/]+/, '');
              sendEvent(controller, {
                type: 'progress',
                message: `Scanne: ${shortUrl}`,
                data: {
                  pagesScanned: scannedCount,
                  totalPages: urlsToProcess.length,
                  matchesFound: matches.length,
                  currentUrl: shortUrl
                }
              });

              const { html, ok, finalUrl } = await fetchPage(url);

              visited.add(url);
              if (finalUrl !== url) {
                if (visited.has(finalUrl)) {
                  sendEvent(controller, {
                    type: 'progress',
                    message: `Uebersprungen: ${shortUrl} (Duplikat nach Weiterleitung zu ${finalUrl.replace(/^https?:\/\/[^/]+/, '')})`,
                    data: {
                      pagesScanned: scannedCount,
                      totalPages: urlsToProcess.length,
                      matchesFound: matches.length,
                      skipped: true
                    }
                  });
                  continue;
                }
                visited.add(finalUrl);
              }

              scannedCount++;

              if (!ok) {
                sendEvent(controller, {
                  type: 'progress',
                  message: `Uebersprungen: ${shortUrl} (nicht erreichbar)`,
                  data: {
                    pagesScanned: scannedCount,
                    totalPages: urlsToProcess.length,
                    matchesFound: matches.length,
                    skipped: true
                  }
                });
                continue;
              }

              const text = extractText(html);
              const matchResults = text.match(queryRegex);

              if (matchResults && matchResults.length > 0) {
                const title = extractTitle(html);
                const contextSnippet = extractContextSnippet(text, query, caseSensitive);

                matches.push({
                  url: finalUrl,
                  title: title || finalUrl,
                  contextSnippet,
                  matchCount: matchResults.length,
                });

                sendEvent(controller, {
                  type: 'match',
                  message: `Treffer gefunden: ${title || shortUrl}`,
                  data: {
                    url: finalUrl,
                    title: title || finalUrl,
                    matchCount: matchResults.length,
                    totalMatches: matches.length
                  }
                });
              }

              if (scannedCount % 10 === 0) {
                await supabase
                  .from('scan_sessions')
                  .update({
                    total_pages_scanned: scannedCount,
                    total_matches: matches.length,
                  })
                  .eq('id', session.id);
              }
            }
          } else {
            const toVisit: string[] = [normalizeUrl(normalizedTargetUrl)];

            while (toVisit.length > 0 && visited.size < effectiveMaxPages) {
              const currentUrl = toVisit.shift()!;

              if (visited.has(currentUrl)) continue;

              if (!queryParamWarningShown && hasQueryParams(currentUrl)) {
                queryParamWarningShown = true;
                sendEvent(controller, {
                  type: 'warning',
                  message: `Hinweis: Einige URLs enthalten Query-Parameter (z.B. ${new URL(currentUrl).search}). Seiten mit gleichen Inhalten aber unterschiedlichen Parametern werden nicht als Duplikate erkannt und koennen mehrfach gescannt werden.`,
                  data: { url: currentUrl }
                });
              }

              const shortUrl = currentUrl.replace(/^https?:\/\/[^/]+/, '');
              sendEvent(controller, {
                type: 'progress',
                message: `Scanne: ${shortUrl}`,
                data: {
                  pagesScanned: visited.size,
                  totalPages: Math.min(visited.size + toVisit.length, effectiveMaxPages),
                  matchesFound: matches.length,
                  currentUrl: shortUrl,
                  queueSize: toVisit.length
                }
              });

              const { html, ok, finalUrl } = await fetchPage(currentUrl);

              visited.add(currentUrl);
              if (finalUrl !== currentUrl) {
                if (visited.has(finalUrl)) continue;
                visited.add(finalUrl);
              }

              if (!ok) continue;

              await supabase
                .from('scan_sessions')
                .update({
                  total_pages_scanned: visited.size,
                  total_pages_found: visited.size + toVisit.length,
                })
                .eq('id', session.id);

              const text = extractText(html);
              const matchResults = text.match(queryRegex);

              if (matchResults && matchResults.length > 0) {
                const title = extractTitle(html);
                const contextSnippet = extractContextSnippet(text, query, caseSensitive);

                matches.push({
                  url: finalUrl,
                  title: title || finalUrl,
                  contextSnippet,
                  matchCount: matchResults.length,
                });

                sendEvent(controller, {
                  type: 'match',
                  message: `Treffer: ${title || shortUrl}`,
                  data: {
                    url: finalUrl,
                    title: title || finalUrl,
                    matchCount: matchResults.length,
                    totalMatches: matches.length
                  }
                });
              }

              const newLinks = extractLinks(html, finalUrl, targetDomain);
              for (const link of newLinks) {
                if (!visited.has(link) && !toVisit.includes(link)) {
                  toVisit.push(link);
                }
              }
            }
          }

          sendEvent(controller, {
            type: 'status',
            message: 'Speichere Ergebnisse...',
            data: { phase: 'saving' }
          });

          await supabase
            .from('scan_sessions')
            .update({
              status: 'searching',
            })
            .eq('id', session.id);

          if (matches.length > 0) {
            const matchInserts = matches.map((match, index) => ({
              session_id: session.id,
              page_url: match.url,
              page_title: match.title,
              context_snippet: match.contextSnippet,
              match_count: match.matchCount,
              position: index + 1,
            }));

            await supabase
              .from('scan_matches')
              .insert(matchInserts);
          }

          await supabase
            .from('scan_sessions')
            .update({
              status: 'completed',
              total_pages_scanned: visited.size,
              total_pages_found: visited.size,
              total_matches: matches.length,
            })
            .eq('id', session.id);

          sendEvent(controller, {
            type: 'complete',
            message: 'Scan abgeschlossen',
            data: {
              sessionId: session.id,
              status: 'completed',
              totalPagesScanned: visited.size,
              totalMatches: matches.length,
              usedSitemap,
              matches: matches.map((m, i) => ({
                position: i + 1,
                url: m.url,
                title: m.title,
                contextSnippet: m.contextSnippet,
                matchCount: m.matchCount,
              })),
            }
          });

          controller.close();
        } catch (error) {
          console.error('Scan error:', error);
          sendEvent(controller, {
            type: 'error',
            message: 'Ein unerwarteter Fehler ist aufgetreten'
          });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        ...securityHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Scan error:', error);
    return new Response(
      JSON.stringify({
        error: 'Scan fehlgeschlagen',
        message: 'Ein unerwarteter Fehler ist aufgetreten',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
