import { useState } from 'react';
import { Shield, ShieldOff, Eye, EyeOff, X } from 'lucide-react';
import { getAdminToken, setAdminToken, clearAdminToken } from '../lib/supabase';

interface AdminPanelProps {
  onClose: () => void;
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isActive, setIsActive] = useState(!!getAdminToken());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  function activate() {
    if (!token.trim()) {
      setFeedback({ type: 'error', message: 'Bitte Admin-Token eingeben.' });
      return;
    }
    setAdminToken(token.trim());
    setIsActive(true);
    setToken('');
    setFeedback({ type: 'success', message: 'Admin-Modus aktiviert. Scan-Limit aufgehoben.' });
  }

  function deactivate() {
    clearAdminToken();
    setIsActive(false);
    setFeedback({ type: 'success', message: 'Admin-Modus deaktiviert.' });
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base">Admin-Modus</h2>
              <p className="text-gray-400 text-xs">Scan-Limit aufheben</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {isActive ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Shield className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-emerald-800">Admin-Modus aktiv</p>
                  <p className="text-xs text-emerald-600">Das Scan-Limit gilt nicht für dich.</p>
                </div>
              </div>
              <button
                onClick={deactivate}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors text-sm"
              >
                <ShieldOff className="w-4 h-4" />
                Admin-Modus deaktivieren
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Gib deinen Admin-Token ein, um das tägliche Scan-Limit aufzuheben.
              </p>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide">
                  Admin-Token
                </label>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && activate()}
                    placeholder="Token eingeben..."
                    className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-transparent font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                onClick={activate}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-colors text-sm"
              >
                <Shield className="w-4 h-4" />
                Aktivieren
              </button>
            </div>
          )}

          {feedback && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {feedback.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
