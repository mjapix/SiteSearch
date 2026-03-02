import { useEffect, useRef } from 'react';
import { Terminal, CheckCircle2, AlertCircle, Search, Loader2, AlertTriangle } from 'lucide-react';

export interface LogEntry {
  id: string;
  type: 'info' | 'success' | 'error' | 'progress' | 'match' | 'warning';
  message: string;
  timestamp: Date;
}

interface ScanTerminalProps {
  logs: LogEntry[];
  isActive: boolean;
}

export function ScanTerminal({ logs, isActive }: ScanTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
      case 'match':
        return <Search className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
      case 'progress':
        return <Loader2 className="w-3.5 h-3.5 text-teal-400 flex-shrink-0 animate-spin" />;
      case 'warning':
        return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />;
      default:
        return <span className="w-3.5 h-3.5 text-gray-500 flex-shrink-0">{'>'}</span>;
    }
  };

  const getTextColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return 'text-emerald-400';
      case 'error':
        return 'text-red-400';
      case 'match':
        return 'text-amber-400';
      case 'progress':
        return 'text-teal-300';
      case 'warning':
        return 'text-yellow-300';
      default:
        return 'text-gray-400';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 border-b border-gray-700">
        <Terminal className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-300">Scan-Protokoll</span>
        {isActive && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs text-emerald-400">Aktiv</span>
          </span>
        )}
      </div>
      <div
        ref={scrollRef}
        className="h-48 overflow-y-auto p-3 font-mono text-xs space-y-1 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600">
            Warte auf Scan-Start...
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 leading-relaxed">
              <span className="text-gray-600 select-none">[{formatTime(log.timestamp)}]</span>
              {getIcon(log.type)}
              <span className={getTextColor(log.type)}>{log.message}</span>
            </div>
          ))
        )}
        {isActive && logs.length > 0 && (
          <div className="flex items-center gap-2 text-gray-600">
            <span className="animate-pulse">_</span>
          </div>
        )}
      </div>
    </div>
  );
}
