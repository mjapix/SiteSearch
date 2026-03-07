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

interface PreviewRequest {
  query: string;
  targetUrl: string;
  exactPhrase: boolean;
  caseSensitive: boolean;
}

interface PreviewMatch {
  url: string;
  title: string;
  contextSnippet: string;
  matchCount: number;
}

interface SitemapResult {
  urls: string[];
  isSitemap: boolean;
}

const PREVIEW_PAGES = 3;
const CRAWL_TIMEOUT = 8000;
const DAILY_SCAN_LIMIT = 4;
const DAILY_PREVIEW_LIMIT = 20;

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

const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5 MB

async function fetchPage(url: string): Promise<{ html: string; ok: boolean; finalUrl: string }> {
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
        'Accept': 'text/html,application/xhtml+xml,application/xml',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    // Re-check URL after following redirects to prevent SSRF via open redirect
    if (!isSafeUrl(response.url)) {
      return { html: '', ok: false, finalUrl: url };
    }

    if (!response.ok) {
      return { html: '', ok: false, finalUrl: url };
    }

    // Reject oversized responses before buffering to prevent memory exhaustion
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return { html: '', ok: false, finalUrl: response.url };
    }

    const html = await response.text();
    const finalUrl = response.url || url;
    return { html: html.slice(0, MAX_BODY_SIZE), ok: true, finalUrl };
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
        // Only process URLs that belong to the target domain to prevent proxy abuse
        const locDomain = extractDomain(loc);
        if (!locDomain || locDomain !== domain) continue;

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

function hasQueryParams(url: string): boolean {
  try {
    return new URL(url).search !== '';
  } catch {
    return false;
  }
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

async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + 'salt-for-privacy-preview');
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

    // Prefer cf-connecting-ip (set by Cloudflare, cannot be spoofed by clients)
    // x-forwarded-for is client-controlled and must not be trusted for rate limiting
    const clientIp = req.headers.get('cf-connecting-ip') ||
                     req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ||
                     'unknown';
    const ipHash = await hashIp(clientIp);
    const clientId = req.headers.get('x-client-id');

    let remainingScans = isAdmin ? 999 : DAILY_SCAN_LIMIT;

    if (!isAdmin) {
      const { data: usageData, isClientBased } = await getUsageRecord(supabase, clientId, ipHash);
      const resetAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      if (usageData) {
        if (new Date(usageData.reset_at) <= new Date()) {
          remainingScans = DAILY_SCAN_LIMIT;
        } else {
          remainingScans = Math.max(0, DAILY_SCAN_LIMIT - usageData.scans_today);
        }

        // Preview-Limit prüfen und Zähler erhöhen
        const previewExpired = !usageData.preview_reset_at || new Date(usageData.preview_reset_at) <= new Date();
        const previewCount = previewExpired ? 0 : (usageData.previews_today ?? 0);

        if (previewCount >= DAILY_PREVIEW_LIMIT) {
          return new Response(
            JSON.stringify({
              error: 'Vorschau-Limit erreicht',
              message: `Tägliches Vorschau-Limit von ${DAILY_PREVIEW_LIMIT} erreicht. Bitte morgen erneut versuchen.`,
            }),
            { status: 429, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const updateKey = isClientBased ? { client_id: clientId } : { ip_hash: ipHash };
        await supabase.from('usage_limits').update({
          previews_today: previewExpired ? 1 : previewCount + 1,
          preview_reset_at: previewExpired ? resetAt : usageData.preview_reset_at,
        }).match(updateKey);
      } else {
        // Neuer Nutzer – Datensatz anlegen
        if (isClientBased) {
          await supabase.from('usage_limits').insert({
            client_id: clientId, scans_today: 0, reset_at: resetAt,
            previews_today: 1, preview_reset_at: resetAt,
          });
        } else {
          await supabase.from('usage_limits').insert({
            ip_hash: ipHash, scans_today: 0, reset_at: resetAt,
            previews_today: 1, preview_reset_at: resetAt,
          });
        }
      }
    }

    const body: PreviewRequest = await req.json();
    const { query, targetUrl, exactPhrase = true, caseSensitive = false } = body;

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

    let normalizedTargetUrl = targetUrl;
    if (!normalizedTargetUrl.startsWith('http://') && !normalizedTargetUrl.startsWith('https://')) {
      normalizedTargetUrl = 'https://' + normalizedTargetUrl;
    }

    const targetDomain = extractDomain(normalizedTargetUrl);
    if (!targetDomain) {
      return new Response(
        JSON.stringify({ error: 'Ungueltige URL angegeben' }),
        {
          status: 400,
          headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const isSitemapUrl = normalizedTargetUrl.toLowerCase().includes('sitemap') &&
                         normalizedTargetUrl.toLowerCase().endsWith('.xml');

    const matches: PreviewMatch[] = [];
    let pagesChecked = 0;
    const checkedUrls = new Set<string>();

    const regexFlags = caseSensitive ? 'g' : 'gi';
    const queryRegex = new RegExp(escapeRegex(query), regexFlags);

    const userEnteredPage = isSitemapUrl ? null : normalizedTargetUrl;
    let userPageHtml: string | null = null;
    let resolvedTargetUrl = normalizedTargetUrl;
    let resolvedDomain = targetDomain;

    if (userEnteredPage) {
      const { html, ok, finalUrl } = await fetchPage(userEnteredPage);
      if (ok) {
        resolvedTargetUrl = finalUrl;
        resolvedDomain = extractDomain(finalUrl) || targetDomain;
        userPageHtml = html;
        pagesChecked++;
        checkedUrls.add(normalizeUrl(finalUrl));
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
        }
      }
    }

    let allUrls: string[] = [];
    let usedSitemap = false;
    let foundSitemapUrl: string | null = null;

    if (isSitemapUrl) {
      const sitemapResult = await parseSitemap(normalizedTargetUrl, resolvedDomain);
      if (sitemapResult.isSitemap && sitemapResult.urls.length > 0) {
        allUrls = sitemapResult.urls;
        usedSitemap = true;
        foundSitemapUrl = normalizedTargetUrl;
      }
    }

    if (!usedSitemap) {
      const commonSitemapUrls = [
        `https://${resolvedDomain}/sitemap.xml`,
        `https://${resolvedDomain}/sitemap_index.xml`,
        `https://${resolvedDomain}/sitemap/sitemap.xml`,
      ];

      for (const sitemapUrl of commonSitemapUrls) {
        const sitemapResult = await parseSitemap(sitemapUrl, resolvedDomain);
        if (sitemapResult.isSitemap && sitemapResult.urls.length > 0) {
          allUrls = sitemapResult.urls;
          usedSitemap = true;
          foundSitemapUrl = sitemapUrl;
          break;
        }
      }
    }

    let additionalUrls: string[] = [];

    if (usedSitemap) {
      additionalUrls = allUrls.filter(url => !checkedUrls.has(url));
    } else if (userPageHtml) {
      additionalUrls = extractLinks(userPageHtml, resolvedTargetUrl, resolvedDomain);
      allUrls = [resolvedTargetUrl, ...additionalUrls];
    }

    for (const url of additionalUrls) {
      if (pagesChecked >= PREVIEW_PAGES) break;
      if (checkedUrls.has(url)) continue;

      const { html, ok } = await fetchPage(url);
      if (!ok) continue;

      pagesChecked++;
      checkedUrls.add(url);
      const text = extractText(html);
      const matchResults = text.match(queryRegex);

      if (matchResults && matchResults.length > 0) {
        const title = extractTitle(html);
        const contextSnippet = extractContextSnippet(text, query, caseSensitive);

        matches.push({
          url,
          title: title || url,
          contextSnippet,
          matchCount: matchResults.length,
        });
      }
    }

    const estimatedDuration = Math.ceil(allUrls.length * 0.8);

    const urlsWithQueryParams = allUrls.filter(hasQueryParams);
    const queryParamWarning = urlsWithQueryParams.length > 0
      ? `${urlsWithQueryParams.length} von ${allUrls.length} URLs enthalten Query-Parameter. Seiten mit gleichen Inhalten aber unterschiedlichen Parametern werden nicht als Duplikate erkannt und koennen mehrfach gescannt werden.`
      : null;

    return new Response(
      JSON.stringify({
        preview: {
          matches,
          pagesChecked,
          hasMatches: matches.length > 0,
        },
        sitemapInfo: {
          usedSitemap,
          totalUrls: allUrls.length,
          estimatedDurationSeconds: estimatedDuration,
          sitemapUrl: foundSitemapUrl,
          sitemapUrls: usedSitemap ? allUrls : [],
        },
        queryParamWarning,
        remainingScans,
        query,
        targetUrl: resolvedTargetUrl,
        originalUrl: normalizedTargetUrl,
        resolvedDomain,
        options: {
          exactPhrase,
          caseSensitive,
        },
      }),
      {
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Preview error:', error);
    return new Response(
      JSON.stringify({
        error: 'Vorschau fehlgeschlagen',
        message: 'Ein unerwarteter Fehler ist aufgetreten',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
