import { ExternalLink, Hash } from 'lucide-react';

interface ResultCardProps {
  url: string;
  title: string;
  contextSnippet?: string;
  matchCount?: number;
  position?: number;
  query: string;
  isPreview?: boolean;
}

function highlightQuery(text: string, query: string) {
  if (!text || !query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 text-yellow-900 px-0.5 rounded">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function ResultCard({ url, title, contextSnippet, matchCount, position, query, isPreview = false }: ResultCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-lg shadow-gray-200/30 border border-gray-100 p-5 hover:shadow-xl hover:border-gray-200 transition-all duration-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {position !== undefined ? (
              <span className="inline-flex items-center justify-center w-6 h-6 bg-teal-100 text-teal-700 text-xs font-bold rounded-full flex-shrink-0">
                {position}
              </span>
            ) : (
              <span className="inline-flex items-center justify-center w-6 h-6 bg-gray-100 text-gray-400 text-xs font-medium rounded-full flex-shrink-0">
                ~
              </span>
            )}
            <h4 className="font-medium text-gray-900 truncate">
              {title || url}
            </h4>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-teal-600 hover:text-teal-700 hover:underline truncate block mb-3"
          >
            {url}
          </a>
          {contextSnippet && (
            <p className="text-sm text-gray-600 leading-relaxed">
              {highlightQuery(contextSnippet, query)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {matchCount !== undefined && (
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
              <div className="flex items-center gap-1 mb-0.5">
                <Hash className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-400">Treffer</span>
              </div>
              <span className="text-lg font-semibold text-teal-600">{matchCount}</span>
            </div>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-teal-100 text-gray-600 hover:text-teal-700 rounded-lg transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
