import { useState } from 'react';
import { Search, Shield } from 'lucide-react';
import { isAdminMode } from '../lib/supabase';
import { AdminPanel } from './AdminPanel';

export function Header() {
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminActive, setAdminActive] = useState(isAdminMode());

  function handleClose() {
    setAdminActive(isAdminMode());
    setShowAdmin(false);
  }

  return (
    <>
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
                <Search className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">SiteSearch</h1>
                <p className="text-xs text-gray-500">Websites nach Inhalten durchsuchen</p>
              </div>
            </div>
            <button
              onClick={() => setShowAdmin(true)}
              title="Admin-Modus"
              className={`p-2 rounded-lg transition-colors ${
                adminActive
                  ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Shield className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>
      {showAdmin && <AdminPanel onClose={handleClose} />}
    </>
  );
}
