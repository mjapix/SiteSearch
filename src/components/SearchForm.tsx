import { useState, useMemo } from 'react';
import { Search, Globe, Loader2, AlertCircle, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

interface SearchFormProps {
  onPreview: (query: string, targetUrl: string, options: SearchOptions) => void;
  isLoading: boolean;
  error: string | null;
  remainingScans: number | null;
}

export interface SearchOptions {
  exactPhrase: boolean;
  caseSensitive: boolean;
}

export function SearchForm({ onPreview, isLoading, error, remainingScans }: SearchFormProps) {
  const [query, setQuery] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [options, setOptions] = useState<SearchOptions>({
    exactPhrase: true,
    caseSensitive: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) {
      setValidationError('Suchbegriff muss mindestens 2 Zeichen lang sein.');
      return;
    }
    setValidationError(null);
    if (query.trim() && targetUrl.trim()) {
      onPreview(query.trim(), targetUrl.trim(), options);
    }
  };

  const urlWarning = useMemo(() => {
    const raw = targetUrl.trim();
    if (!raw) return null;

    try {
      const normalized = raw.startsWith('http') ? raw : `https://${raw}`;
      const parsed = new URL(normalized);

      if (parsed.search) {
        const params = new URLSearchParams(parsed.search);
        const paramNames = Array.from(params.keys());
        const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ref', 'source'];
        const hasTracking = paramNames.some(p => trackingParams.includes(p));

        if (hasTracking) {
          return 'Diese URL enthält Tracking-Parameter (z.B. utm_source). Seiten mit identischem Inhalt aber unterschiedlichen Parametern können als Duplikate nicht erkannt werden – jede Parametervariation wird separat gescannt.';
        }

        return `Diese URL enthält Query-Parameter (?${paramNames.join(', ')}). Seiten mit denselben Inhalten aber unterschiedlichen Parametern werden nicht als Duplikate erkannt und ggf. mehrfach gescannt.`;
      }
    } catch {
      // invalid URL, no warning needed
    }

    return null;
  }, [targetUrl]);

  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
      <div className="p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Website-Inhalte gezielt durchsuchen
          </h2>
          <p className="text-gray-500">
            Gib zuerst ein, wonach du suchst, dann die Website oder Sitemap
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-2">
              1. Was suchst du?
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="z.B. Datenschutz, Cookie-Richtlinie, Kontakt..."
                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                disabled={isLoading}
                maxLength={500}
                autoFocus
              />
            </div>
          </div>

          <div>
            <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
              2. Wo soll gesucht werden?
            </label>
            <div className="relative">
              <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="url"
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="z.B. example.com oder example.com/sitemap.xml"
                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                disabled={isLoading}
                maxLength={2048}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Tipp: Gib eine Sitemap-URL an (z.B. /sitemap.xml) für schnellere und vollständigere Ergebnisse
            </p>
            {urlWarning && (
              <div className="flex items-start gap-2.5 mt-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">{urlWarning}</p>
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowOptions(!showOptions)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              {showOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Erweiterte Optionen
            </button>

            {showOptions && (
              <div className="mt-3 p-4 bg-gray-50 rounded-xl space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.exactPhrase}
                    onChange={(e) => setOptions({ ...options, exactPhrase: e.target.checked })}
                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">Exakte Phrase</span>
                    <p className="text-xs text-gray-500">Sucht nach der genauen Wortreihenfolge</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.caseSensitive}
                    onChange={(e) => setOptions({ ...options, caseSensitive: e.target.checked })}
                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">Groß-/Kleinschreibung beachten</span>
                    <p className="text-xs text-gray-500">Unterscheidet zwischen "ABC" und "abc"</p>
                  </div>
                </label>
              </div>
            )}
          </div>

          {validationError && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{validationError}</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || query.trim().length < 2 || !targetUrl.trim()}
            className="w-full py-4 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 hover:from-teal-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Vorschau wird geladen...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Vorschau anzeigen
              </>
            )}
          </button>
        </form>
      </div>

      <div className="px-8 py-4 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Vorschau ist kostenlos. Vollständiger Scan verbraucht 1 von {remainingScans !== null ? remainingScans : '...'} verbleibenden Scans.
          </p>
          {remainingScans !== null && remainingScans <= 2 && (
            <span className="text-xs font-medium text-amber-600">
              Noch {remainingScans} Scans heute
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
