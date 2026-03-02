import { Eye, MapPin, Clock, AlertTriangle, CheckCircle, Loader2, Search, FileText, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { ResultCard } from './ResultCard';

interface PreviewMatch {
  url: string;
  title: string;
  contextSnippet: string;
  matchCount: number;
}

interface PreviewData {
  preview: {
    matches: PreviewMatch[];
    pagesChecked: number;
    hasMatches: boolean;
  };
  sitemapInfo: {
    usedSitemap: boolean;
    totalUrls: number;
    estimatedDurationSeconds: number;
    sitemapUrl?: string;
    sitemapUrls?: string[];
  };
  queryParamWarning: string | null;
  remainingScans: number;
  query: string;
  targetUrl: string;
}

interface PreviewResultsProps {
  data: PreviewData;
  onStartFullScan: () => void;
  onBack: () => void;
  isScanning: boolean;
}

export function PreviewResults({ data, onStartFullScan, onBack, isScanning }: PreviewResultsProps) {
  const { preview, sitemapInfo, queryParamWarning, remainingScans, query } = data;
  const [showSitemapUrls, setShowSitemapUrls] = useState(false);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `~${seconds} Sekunden`;
    const minutes = Math.ceil(seconds / 60);
    return `~${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`;
  };

  const canScan = remainingScans > 0;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-5 h-5 text-teal-600" />
                <h3 className="text-lg font-semibold text-gray-900">Vorschau</h3>
              </div>
              <p className="text-sm text-gray-500">
                Suche nach "<span className="font-medium text-gray-700">{query}</span>"
              </p>
            </div>
            <button
              onClick={onBack}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Zurück
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {sitemapInfo.usedSitemap && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-teal-800">
                      Sitemap gefunden
                    </p>
                    <span className="px-2 py-0.5 text-xs font-medium bg-teal-100 text-teal-700 rounded-full">
                      {sitemapInfo.totalUrls} URLs
                    </span>
                  </div>
                  {sitemapInfo.sitemapUrl && (
                    <a
                      href={sitemapInfo.sitemapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-teal-600 hover:text-teal-700 hover:underline mt-1 inline-block"
                    >
                      {sitemapInfo.sitemapUrl}
                    </a>
                  )}
                  {sitemapInfo.sitemapUrls && sitemapInfo.sitemapUrls.length > 0 && (
                    <div className="mt-3">
                      <button
                        onClick={() => setShowSitemapUrls(!showSitemapUrls)}
                        className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 transition-colors"
                      >
                        {showSitemapUrls ? (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            URLs ausblenden
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4" />
                            Alle {sitemapInfo.sitemapUrls.length} URLs anzeigen
                          </>
                        )}
                      </button>
                      {showSitemapUrls && (
                        <div className="mt-3 max-h-64 overflow-y-auto bg-white rounded-lg border border-teal-100">
                          <ul className="divide-y divide-teal-50">
                            {sitemapInfo.sitemapUrls.map((url, index) => (
                              <li key={index} className="px-3 py-2 hover:bg-teal-50/50 transition-colors">
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-gray-700 hover:text-teal-600 truncate block"
                                >
                                  {url}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!sitemapInfo.usedSitemap && (
            <div className="bg-gray-100 border border-gray-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-700">
                    Keine Sitemap gefunden
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Seiten werden durch Crawlen der verlinkten Seiten gefunden.
                  </p>
                </div>
              </div>
            </div>
          )}

          {queryParamWarning && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Query-Parameter entdeckt</p>
                <p className="text-sm text-amber-700 mt-1">{queryParamWarning}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <MapPin className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Gefundene Seiten</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{sitemapInfo.totalUrls}</p>
              <p className="text-xs text-gray-500 mt-1">
                {sitemapInfo.usedSitemap ? 'via Sitemap' : 'zum Crawlen'}
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Geschätzte Dauer</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {formatDuration(sitemapInfo.estimatedDurationSeconds)}
              </p>
              <p className="text-xs text-gray-500 mt-1">für vollständigen Scan</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <Search className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Vorschau-Treffer</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{preview.matches.length}</p>
              <p className="text-xs text-gray-500 mt-1">
                in {preview.pagesChecked} {preview.pagesChecked === 1 ? 'Seite' : 'Seiten'} geprüft
              </p>
            </div>
          </div>

          {preview.hasMatches ? (
            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-800">
                    {preview.matches.length} {preview.matches.length === 1 ? 'Treffer' : 'Treffer'} in der Vorschau gefunden
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    Starte den vollständigen Scan, um alle Treffer auf {sitemapInfo.totalUrls} Seiten zu finden.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">
                    Keine Treffer in der Vorschau
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    Die Suchpassage wurde in den ersten {preview.pagesChecked} Seiten nicht gefunden.
                    Es könnte aber auf anderen der {sitemapInfo.totalUrls} Seiten vorkommen.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {preview.matches.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-gray-700 text-sm px-1">Vorschau-Treffer</h4>
          {preview.matches.map((match, index) => (
            <ResultCard
              key={index}
              url={match.url}
              title={match.title}
              contextSnippet={match.contextSnippet}
              matchCount={match.matchCount}
              query={query}
              isPreview
            />
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-600">
              {canScan ? (
                <>
                  Du hast noch <span className="font-semibold text-gray-900">{remainingScans} Scans</span> heute verfügbar.
                </>
              ) : (
                <span className="text-red-600 font-medium">
                  Du hast dein tägliches Limit erreicht. Versuche es morgen erneut.
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onStartFullScan}
            disabled={!canScan || isScanning}
            className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 hover:from-teal-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Scan läuft...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Vollständigen Scan starten
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
