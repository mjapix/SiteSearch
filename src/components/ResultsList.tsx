import { FileText, Check, Share2, Clock, Globe, MapPin, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { ResultCard } from './ResultCard';

interface Match {
  position: number;
  url: string;
  title: string;
  contextSnippet: string;
  matchCount: number;
}

interface ResultsListProps {
  matches: Match[];
  totalPagesScanned: number;
  query: string;
  targetUrl: string;
  sessionId: string;
  onNewSearch: () => void;
  durationSeconds: number | null;
  usedSitemap: boolean;
  sitemapPagesCount: number | null;
  effectiveUrl: string | null;
}

export function ResultsList({
  matches,
  totalPagesScanned,
  query,
  targetUrl,
  sessionId,
  onNewSearch,
  durationSeconds,
  usedSitemap,
  sitemapPagesCount,
  effectiveUrl,
}: ResultsListProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  const shareableLink = `${window.location.origin}?session=${sessionId}`;

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds} Sek.`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return remaining > 0 ? `${minutes} Min. ${remaining} Sek.` : `${minutes} Min.`;
  };

  const showStats = durationSeconds !== null || sitemapPagesCount !== null || effectiveUrl !== null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      console.error('Failed to copy');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {matches.length} {matches.length === 1 ? 'Treffer' : 'Treffer'} gefunden
            </h3>
            <p className="text-sm text-gray-500">
              {totalPagesScanned} Seiten nach „{query}" durchsucht
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  Kopiert!
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  Ergebnisse teilen
                </>
              )}
            </button>
            <button
              onClick={onNewSearch}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
            >
              Neue Suche
            </button>
          </div>
        </div>
      </div>

      {showStats && (
        <div className={`grid gap-4 ${[durationSeconds !== null, sitemapPagesCount !== null, effectiveUrl !== null].filter(Boolean).length === 3 ? 'grid-cols-1 sm:grid-cols-3' : [durationSeconds !== null, sitemapPagesCount !== null, effectiveUrl !== null].filter(Boolean).length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
          {durationSeconds !== null && (
            <div className="bg-white rounded-xl shadow-lg shadow-gray-200/30 border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Scan-Dauer</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatDuration(durationSeconds)}</p>
              <p className="text-xs text-gray-400 mt-1">effektive Laufzeit</p>
            </div>
          )}

          {sitemapPagesCount !== null && (
            <div className="bg-white rounded-xl shadow-lg shadow-gray-200/30 border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <MapPin className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Seiten</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{totalPagesScanned}</p>
              <p className="text-xs text-gray-400 mt-1">
                {usedSitemap ? `von ${sitemapPagesCount} via Sitemap` : 'gescannte Seiten'}
              </p>
            </div>
          )}

          {effectiveUrl !== null && (
            <div className="bg-white rounded-xl shadow-lg shadow-gray-200/30 border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Globe className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Effektive URL</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <ArrowRight className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                <a
                  href={effectiveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-teal-600 hover:text-teal-700 hover:underline truncate"
                >
                  {new URL(effectiveUrl).hostname}
                </a>
              </div>
              <p className="text-xs text-gray-400 mt-1">Weiterleitung erkannt</p>
            </div>
          )}
        </div>
      )}

      {matches.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-2xl mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h4 className="text-lg font-medium text-gray-900 mb-2">Keine Treffer gefunden</h4>
          <p className="text-gray-500 max-w-md mx-auto">
            Der Suchbegriff „{query}" wurde auf keiner der {totalPagesScanned} durchsuchten Seiten von {new URL(targetUrl).hostname} gefunden.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((match) => (
            <ResultCard
              key={match.position}
              url={match.url}
              title={match.title}
              contextSnippet={match.contextSnippet}
              matchCount={match.matchCount}
              position={match.position}
              query={query}
            />
          ))}
        </div>
      )}

      <div className="text-center py-4">
        <p className="text-xs text-gray-400">
          Ergebnisse verfallen nach 24 Stunden. Teile den Link, damit andere die Ergebnisse sehen können.
        </p>
      </div>
    </div>
  );
}
