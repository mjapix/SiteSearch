import { Loader2, FileSearch, CheckCircle2, Search, AlertCircle, ArrowLeft } from 'lucide-react';
import { ScanTerminal, type LogEntry } from './ScanTerminal';

interface ScanProgressProps {
  status: 'pending' | 'crawling' | 'searching' | 'completed' | 'failed';
  pagesScanned: number;
  pagesFound: number;
  query: string;
  targetUrl: string;
  matchesFound?: number;
  logs?: LogEntry[];
  currentUrl?: string;
  onBack?: () => void;
}

export function ScanProgress({
  status,
  pagesScanned,
  pagesFound,
  query,
  targetUrl,
  matchesFound = 0,
  logs = [],
  currentUrl,
  onBack,
}: ScanProgressProps) {
  const getStatusInfo = () => {
    switch (status) {
      case 'pending':
        return { text: 'Scan wird vorbereitet...', icon: Loader2, animate: true, color: 'teal' };
      case 'crawling':
        return { text: 'Website wird durchsucht...', icon: FileSearch, animate: true, color: 'teal' };
      case 'searching':
        return { text: 'Inhalte werden analysiert...', icon: Search, animate: true, color: 'teal' };
      case 'completed':
        return { text: 'Scan abgeschlossen', icon: CheckCircle2, animate: false, color: 'teal' };
      case 'failed':
        return { text: 'Scan fehlgeschlagen', icon: AlertCircle, animate: false, color: 'red' };
      default:
        return { text: 'Verarbeitung läuft...', icon: Loader2, animate: true, color: 'teal' };
    }
  };

  const statusInfo = getStatusInfo();
  const Icon = statusInfo.icon;
  const progress = pagesFound > 0 ? (pagesScanned / Math.max(pagesFound, pagesScanned)) * 100 : 0;
  const isActive = status !== 'completed' && status !== 'failed';
  const isFailed = status === 'failed';

  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8">
      <div className="text-center mb-6">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ${isFailed ? 'bg-red-50' : 'bg-teal-50'}`}>
          <Icon className={`w-8 h-8 ${isFailed ? 'text-red-500' : 'text-teal-600'} ${statusInfo.animate ? 'animate-spin' : ''}`} />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{statusInfo.text}</h3>
        <p className="text-sm text-gray-500">
          Suche nach "<span className="font-medium text-gray-700">{query}</span>"
        </p>
        <p className="text-xs text-gray-400 mt-1 truncate max-w-md mx-auto">{targetUrl}</p>
      </div>

      <div className="space-y-4 mb-6">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Seiten durchsucht</span>
          <span className="font-medium text-gray-900">{pagesScanned} / {pagesFound || '...'}</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Bisherige Treffer</div>
            <div className="text-xl font-semibold text-teal-600">{matchesFound}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Fortschritt</div>
            <div className="text-xl font-semibold text-gray-900">{Math.round(progress)}%</div>
          </div>
        </div>

        {currentUrl && (
          <div className="text-xs text-gray-500 truncate">
            Aktuell: <span className="text-gray-700">{currentUrl}</span>
          </div>
        )}
      </div>

      <ScanTerminal logs={logs} isActive={isActive} />

      {isFailed && onBack ? (
        <button
          onClick={onBack}
          className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück zur Suche
        </button>
      ) : (
        <p className="text-xs text-gray-400 text-center mt-6">
          Bitte warte, während alle Seiten durchsucht werden...
        </p>
      )}
    </div>
  );
}
