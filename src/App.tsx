import { useEffect } from 'react';
import { Header } from './components/Header';
import { SearchForm } from './components/SearchForm';
import { PreviewResults } from './components/PreviewResults';
import { ScanProgress } from './components/ScanProgress';
import { ResultsList } from './components/ResultsList';
import { useScanner, getSessionFromUrl, getSavedSessionId } from './hooks/useScanner';

function App() {
  const {
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
  } = useScanner();

  useEffect(() => {
    const urlSession = getSessionFromUrl();
    const savedSession = getSavedSessionId();
    const sessionToLoad = urlSession || savedSession;

    if (sessionToLoad) {
      loadSession(sessionToLoad);
    }
  }, [loadSession]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <Header />

      <main className="max-w-3xl mx-auto px-4 py-12">
        {phase === 'search' && (
          <SearchForm
            onPreview={startPreview}
            isLoading={isLoading}
            error={error}
            remainingScans={remainingScans}
          />
        )}

        {phase === 'preview' && previewData && (
          <PreviewResults
            data={previewData}
            onStartFullScan={startFullScan}
            onBack={backToSearch}
            isScanning={isLoading}
          />
        )}

        {phase === 'scanning' && previewData && (
          <ScanProgress
            status={error ? 'failed' : 'crawling'}
            pagesScanned={scanProgress.pagesScanned}
            pagesFound={scanProgress.totalPages || previewData.sitemapInfo.totalUrls}
            query={previewData.query}
            targetUrl={previewData.targetUrl}
            matchesFound={scanProgress.matchesFound}
            logs={logs}
            currentUrl={scanProgress.currentUrl}
            onBack={backToSearch}
          />
        )}

        {phase === 'results' && result && result.status === 'completed' && (
          <ResultsList
            matches={result.matches}
            totalPagesScanned={result.totalPagesScanned}
            query={result.query}
            targetUrl={result.targetUrl}
            sessionId={result.sessionId}
            onNewSearch={reset}
            durationSeconds={result.durationSeconds}
            usedSitemap={result.usedSitemap}
            sitemapPagesCount={result.sitemapPagesCount}
            effectiveUrl={result.effectiveUrl}
          />
        )}
      </main>

      <footer className="py-8 text-center">
        <p className="text-sm text-gray-400">
          SiteSearch durchsucht Websites nach bestimmten Textpassagen.
        </p>
      </footer>
    </div>
  );
}

export default App;
