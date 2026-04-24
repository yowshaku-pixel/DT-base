import React, { useState, useEffect } from 'react';
import { Settings, Key, Save, X, ShieldCheck, AlertCircle } from 'lucide-react';

const ApiSettings: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [extractionKey, setExtractionKey] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const savedKey = localStorage.getItem('dt_base_extraction_key');
    if (savedKey) {
      setExtractionKey(savedKey);
    }
  }, []);

  const handleSave = () => {
    if (extractionKey.trim()) {
      localStorage.setItem('dt_base_extraction_key', extractionKey.trim());
    } else {
      localStorage.removeItem('dt_base_extraction_key');
    }
    // Dispatch storage event for same-window updates
    window.dispatchEvent(new Event('storage'));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 bg-surface border border-border text-muted hover:text-purple-600 dark:hover:text-purple-400 hover:bg-surface/80 transition-all rounded active:scale-95 flex items-center gap-2"
        title="API Configuration"
      >
        <Settings className="w-3 h-3" />
        <span className="text-[8px] font-mono uppercase tracking-wider hidden sm:inline">API Config</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-bg border border-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Key className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h2 className="text-sm font-display font-bold uppercase tracking-widest text-text">API Configuration</h2>
                  <p className="text-[10px] text-muted uppercase tracking-wider">Manage your extraction limits</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-surface rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-muted hover:text-text" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                  <ShieldCheck className="w-4 h-4" />
                  <h3 className="text-[10px] font-display font-bold uppercase tracking-[0.2em]">Universal AI Key (Paid Tier)</h3>
                </div>
                <p className="text-[10px] text-muted leading-relaxed">
                  Paste your Paid API Key here to use it for <strong>all AI operations</strong> (Image Extraction & Fleet Chat). This bypasses free tier limits and ensures maximum performance.
                </p>
                <div className="relative">
                  <input
                    type="password"
                    value={extractionKey}
                    onChange={(e) => setExtractionKey(e.target.value)}
                    placeholder="Enter your Paid API Key..."
                    className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-xs font-mono text-purple-600 dark:text-purple-200 placeholder:text-muted/40 focus:outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>
              </div>

              <div className="p-4 bg-surface border border-border rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-muted">
                  <AlertCircle className="w-4 h-4" />
                  <h3 className="text-[10px] font-display font-bold uppercase tracking-[0.2em]">Security Note</h3>
                </div>
                <p className="text-[10px] text-muted leading-relaxed">
                  Your key is stored <strong>only in your browser's local storage</strong>. It is never sent to our servers or stored in any database.
                </p>
              </div>
            </div>

            <div className="p-6 bg-surface border-t border-border flex justify-end gap-3">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-[10px] font-display font-bold uppercase tracking-widest text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-all flex items-center gap-2 active:scale-95"
              >
                {isSaved ? (
                  <>
                    <ShieldCheck className="w-3 h-3" />
                    <span className="text-[10px] font-display font-bold uppercase tracking-widest">Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3 h-3" />
                    <span className="text-[10px] font-display font-bold uppercase tracking-widest">Save Config</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ApiSettings;
