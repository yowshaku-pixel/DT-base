import React from 'react';
import { Key, Truck, Eye, EyeOff, Lock, Send, Key as KeyIcon, Trash, Trash2, AlertTriangle, Globe } from 'lucide-react';
import { cn } from '../lib/utils';

interface AdvancedSettingsMenuProps {
  isServiceUnlocked: boolean;
  setIsServiceUnlocked: (unlocked: boolean) => void;
  setShowServicePasswordPrompt: (show: boolean) => void;
  setShowSettingsModal: (show: boolean) => void;
  showFleetRegistryList: boolean;
  setShowFleetRegistryList: (show: boolean) => void;
  fleetRegistry: string[];
  setFleetRegistry: (registry: string[]) => void;
  bugCategory: 'app' | 'ocr' | 'sync' | 'other';
  setBugCategory: (cat: 'app' | 'ocr' | 'sync' | 'other') => void;
  bugDescription: string;
  setBugDescription: (desc: string) => void;
  handleSubmitBugReport: () => void;
  onClearLocalCredentials: () => void;
  handleResetDatabase: () => void;
  dangerAction: string | null;
  passwordConfirm: string;
  setPasswordConfirm: (pwd: string) => void;
  passwordError: boolean;
  handleClearDuplicates: () => void;
}

export const AdvancedSettingsMenu: React.FC<AdvancedSettingsMenuProps> = ({
  isServiceUnlocked,
  setIsServiceUnlocked,
  setShowServicePasswordPrompt,
  setShowSettingsModal,
  showFleetRegistryList,
  setShowFleetRegistryList,
  fleetRegistry,
  setFleetRegistry,
  bugCategory,
  setBugCategory,
  bugDescription,
  setBugDescription,
  handleSubmitBugReport,
  onClearLocalCredentials,
  handleResetDatabase,
  dangerAction,
  passwordConfirm,
  setPasswordConfirm,
  passwordError,
  handleClearDuplicates,
}) => {
  const [backendHostInput, setBackendHostInput] = React.useState(() => {
    return typeof window !== 'undefined' ? (localStorage.getItem("DT_BASE_BACKEND_HOST") || "") : "";
  });

  const handleBackendHostChange = (newVal: string) => {
    setBackendHostInput(newVal);
    if (typeof window !== 'undefined') {
      if (newVal.trim()) {
        localStorage.setItem("DT_BASE_BACKEND_HOST", newVal.trim());
      } else {
        localStorage.removeItem("DT_BASE_BACKEND_HOST");
      }
    }
  };

  return (
    <div className="space-y-10">
      {/* Section: Restricted */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="w-1 h-3 bg-amber-500 rounded-full" />
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-amber-500/40">Restricted</p>
        </div>
        {!isServiceUnlocked ? (
          <button 
            type="button"
            onClick={() => {
              setShowServicePasswordPrompt(true);
              setShowSettingsModal(false);
            }}
            className="w-full p-5 bg-amber-500/[0.03] border border-amber-500/20 rounded-3xl flex items-center justify-between hover:bg-amber-500/[0.08] hover:border-amber-500/40 transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                <Key className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex flex-col items-start text-left">
                <span className="text-[11px] font-display font-bold uppercase tracking-[0.2em] text-amber-500/90">Unlock Advanced Services</span>
                <span className="text-[8px] font-mono text-amber-500/40 uppercase tracking-widest mt-0.5">Master Access Required</span>
              </div>
            </div>
          </button>
        ) : (
          <button 
            type="button"
            onClick={() => setIsServiceUnlocked(false)}
            className="w-full p-5 bg-green-500/[0.03] border border-green-500/20 rounded-3xl flex items-center justify-between hover:bg-green-500/[0.08] hover:border-green-500/40 transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-2xl border border-green-500/20">
                <Key className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex flex-col items-start text-left">
                <span className="text-[11px] font-display font-bold uppercase tracking-[0.2em] text-green-500/90">Advanced Services Active</span>
                <span className="text-[8px] font-mono text-green-500/40 uppercase tracking-widest mt-0.5">Tap to Relock System</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-mono text-green-500/60 font-bold uppercase tracking-widest">UNLOCKED</span>
            </div>
          </button>
        )}
      </div>

      {/* Section: Fleet Registry */}
      <div className="space-y-4 pt-4 border-t border-white/5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Truck className="w-3 h-3 text-cyan-400" />
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-cyan-400">Fleet Registry</p>
          </div>
          {isServiceUnlocked && (
            <button 
              type="button"
              onClick={() => setShowFleetRegistryList(!showFleetRegistryList)}
              className="text-[9px] font-display font-bold uppercase tracking-widest text-white/40 hover:text-cyan-400 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {showFleetRegistryList ? (
                <><EyeOff className="w-3 h-3" /> Hide</>
              ) : (
                <><Eye className="w-3 h-3" /> Show</>
              )}
            </button>
          )}
        </div>

        {isServiceUnlocked ? (
          showFleetRegistryList ? (
            <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
              <label htmlFor="fleet-registry-input" className="block text-[9px] text-white/40 uppercase tracking-widest leading-relaxed cursor-pointer">
                Enter your known truck plates (one per line). Records matching these will be grouped normally. Others go to "Needs Review".
              </label>
              <textarea 
                id="fleet-registry-input"
                value={fleetRegistry.join('\n')}
                onChange={(e) => setFleetRegistry(e.target.value.split('\n').map(p => p.toUpperCase()))}
                className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-3 font-mono text-xs text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none transition-all resize-none"
                placeholder="E.G.&#10;KCL 054&#10;KCY 901B&#10;UAY 469L..."
              />
              <div className="flex justify-between items-center text-[8px] font-mono text-white/20 uppercase tracking-[0.2em]">
                <span>{fleetRegistry.length} Plate(s) Registered</span>
              </div>
            </div>
          ) : (
            <button 
              type="button"
              onClick={() => setShowFleetRegistryList(true)}
              className="w-full p-6 bg-white/[0.02] border border-white/5 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-white/[0.05] transition-all group cursor-pointer"
            >
              <div className="p-2 bg-white/5 rounded-full group-hover:bg-cyan-500/10 transition-all">
                <Eye className="w-3 h-3 text-white/20 group-hover:text-cyan-400" />
              </div>
              <p className="text-[8px] font-mono text-white/20 uppercase tracking-[0.2em]">List is Currently Hidden</p>
              <span className="text-[9px] font-display font-bold uppercase tracking-widest text-cyan-400/60 group-hover:text-cyan-400 transition-colors">Tap to View Registry</span>
            </button>
          )
        ) : (
          <button 
            type="button"
            onClick={() => {
              setShowServicePasswordPrompt(true);
              setShowSettingsModal(false);
            }}
            className="w-full p-6 bg-amber-500/[0.02] border border-amber-500/10 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 group hover:bg-amber-500/[0.05] hover:border-amber-500/30 transition-all cursor-pointer text-center"
          >
            <Lock className="w-4 h-4 text-amber-500/40 group-hover:text-amber-500 transition-all" />
            <div>
              <p className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-amber-500/60 group-hover:text-amber-500 transition-colors">Registry Locked</p>
              <p className="text-[7px] font-mono text-white/20 uppercase tracking-widest mt-1">Unlock Advanced Services to Access</p>
            </div>
          </button>
        )}
      </div>

      {/* Section: Support & Feedback */}
      <div className="space-y-4 pt-4 border-t border-white/5">
        <div className="flex items-center gap-2 px-1">
          <div className="w-1 h-3 bg-purple-500 rounded-full" />
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-white/40">Support & Feedback</p>
        </div>
        <div className="p-5 bg-white/[0.02] border border-white/5 rounded-3xl space-y-4">
          <p className="text-[9px] text-white/40 uppercase tracking-widest leading-relaxed">
            Encountered an issue or have a suggestion? Send a diagnostic bug report details to our technical support team!
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <span id="report-category-label" className="text-[8px] font-display font-bold uppercase tracking-wider text-white/40 block ml-1">Report Category</span>
              <div className="grid grid-cols-4 gap-1" role="group" aria-labelledby="report-category-label">
                {(['app', 'ocr', 'sync', 'other'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setBugCategory(cat)}
                    aria-pressed={bugCategory === cat}
                    className={cn(
                      "py-1.5 rounded-lg text-[8px] font-display font-bold uppercase tracking-widest transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none",
                      bugCategory === cat 
                        ? "bg-purple-600 text-white shadow-md shadow-purple-500/10 border border-purple-500/30" 
                        : "bg-white/5 text-white/50 border border-transparent hover:text-white"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="bug-description-input" className="text-[8px] font-display font-bold uppercase tracking-wider text-white/40 block ml-1">Bug Description</label>
              <textarea
                id="bug-description-input"
                placeholder="What went wrong? Be as detailed as possible..."
                value={bugDescription}
                onChange={(e) => setBugDescription(e.target.value)}
                className="w-full h-24 bg-black/60 border border-white/10 rounded-2xl p-3.5 font-sans text-xs focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none text-white placeholder:text-white/10 transition-all resize-none"
              />
            </div>

            <button
              type="button"
              onClick={handleSubmitBugReport}
              disabled={!bugDescription.trim()}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-display font-bold uppercase tracking-widest text-[9px] rounded-xl transition-all shadow-lg shadow-purple-900/10 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-3 h-3" />
              Submit Bug Report
            </button>
          </div>
        </div>
      </div>

      {/* Section: APK & Local Connectivity */}
      <div className="space-y-4 pt-4 border-t border-white/5">
        <div className="flex items-center gap-2 px-1">
          <Globe className="w-3 h-3 text-cyan-400" />
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-cyan-400">APK & Local Connectivity</p>
        </div>
        <div className="p-5 bg-cyan-500/[0.02] border border-cyan-500/10 rounded-3xl space-y-4">
          <p className="text-[9px] text-zinc-400 uppercase tracking-widest leading-relaxed">
            When wrapped inside an APK (via html2app), web requests default to relative file paths which fail. Enter an absolute host address (e.g. your local Termux IP or hosted Cloud Run URL) to route AI assistant (Anni) requests successfully.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="backend-host-input" className="text-[8px] font-display font-bold uppercase tracking-wider text-white/40 block ml-1">AI Backend Host URL</label>
              <div className="flex gap-2">
                <input
                  id="backend-host-input"
                  type="text"
                  placeholder="E.G. http://localhost:3000"
                  value={backendHostInput}
                  onChange={(e) => handleBackendHostChange(e.target.value)}
                  className="flex-1 bg-black/60 border border-white/10 rounded-xl p-3 font-mono text-xs text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none transition-all placeholder:text-white/10"
                />
                <button
                  type="button"
                  onClick={() => handleBackendHostChange("http://localhost:3000")}
                  className="px-3 bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-xl font-mono text-[9px] uppercase tracking-widest transition-all cursor-pointer"
                >
                  Local Termux
                </button>
              </div>
              <p className="text-[7.5px] font-mono text-zinc-500 uppercase tracking-widest block ml-1 mt-1">
                Active Routing: <span className="text-cyan-400 font-bold">{backendHostInput || "Auto-Detect / default to http://localhost:3000 inside APK"}</span>
              </p>
            </div>
            {backendHostInput && (
              <button
                type="button"
                onClick={() => handleBackendHostChange("")}
                className="w-full py-2 bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 text-red-400 font-display font-medium uppercase tracking-widest text-[8px] rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Clear Custom Base URL (Restore Auto-detect)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Section: Diagnostics & Database Wipe */}
      <div className="space-y-4 pt-4 border-t border-white/5">
        <div className="flex items-center gap-2 px-1">
          <div className="w-1 h-3 bg-red-500 rounded-full" />
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-red-500/40">Local Storage & Reset</p>
        </div>
        <div className="p-5 bg-red-500/[0.02] border border-red-500/10 rounded-3xl space-y-4">
          <p className="text-[9px] text-red-400/60 uppercase tracking-widest leading-relaxed">
            In the event of localized data corruption, cache mismatches, or if you wish to clear your local database session token or API credentials, execute the operations below.
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={onClearLocalCredentials}
              className="w-full text-left p-3.5 bg-white/[0.01] hover:bg-white/[0.04] border border-white/5 hover:border-red-500/15 rounded-2xl transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/5 rounded-xl border border-red-500/10 group-hover:bg-red-500/10 transition-all text-red-400">
                  <KeyIcon className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[10px] font-display font-medium text-white uppercase tracking-wider">Wipe Saved API Credentials</span>
                  <span className="text-[7.5px] font-mono text-white/40 uppercase tracking-widest mt-0.5">Reset custom Gemini/Supabase keys</span>
                </div>
              </div>
              <Trash className="w-3.5 h-3.5 text-zinc-600 group-hover:text-red-400 transition-colors" />
            </button>

            <button
              type="button"
              onClick={handleResetDatabase}
              className="w-full text-left p-3.5 bg-red-500/[0.02] hover:bg-red-500/[0.05] border border-red-500/10 hover:border-red-500/20 rounded-2xl transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/15 rounded-xl border border-red-500/30 group-hover:bg-red-500/20 transition-all text-red-400 animate-pulse">
                  <Trash2 className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[10px] font-display font-medium text-red-400 uppercase tracking-wider">Execute Total Data Wipe</span>
                  <span className="text-[7.5px] font-mono text-red-400/40 uppercase tracking-widest mt-0.5">Purge all logs from physical database</span>
                </div>
              </div>
              <AlertTriangle className="w-3.5 h-3.5 text-red-800 group-hover:text-red-400 transition-colors" />
            </button>
          </div>

          {dangerAction && (
            <div className="mt-4 p-4 bg-red-950/20 border border-red-500/30 rounded-2xl space-y-3.5 animate-in slide-in-from-top-3 duration-300">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-500 animate-bounce" />
                <span className="text-[9px] font-display font-bold uppercase tracking-widest text-red-400">DANGER ZONE CONFIRMATION</span>
              </div>
              <p className="text-[8.5px] text-zinc-400 uppercase tracking-widest leading-relaxed">
                {dangerAction === 'clearDuplicates' 
                  ? "This will delete all identified potential and exact duplicate logs from the fleet database. Enter current database access password to authorize."
                  : "WARNING: This operation will completely wipe history and empty your entire database records. This is irreversible. Type MASTER PASSWORD to confirm:"}
              </p>
              <div className="space-y-2">
                <label htmlFor="danger-password-confirm" className="sr-only">Confirm Password</label>
                <input 
                  id="danger-password-confirm"
                  type="password"
                  placeholder="ENTER PASSWORD FOR AUTH..."
                  className="w-full bg-black/50 border border-red-500/20 p-3 rounded-xl font-mono text-xs text-red-200 uppercase tracking-wider focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleClearDuplicates()}
                />
              </div>
              {passwordError && <p className="text-[8px] text-red-400 font-display font-bold uppercase tracking-widest text-center">Incorrect Password</p>}
              <button 
                type="button"
                onClick={handleClearDuplicates}
                className="w-full bg-red-600 hover:bg-red-500 text-white py-4 text-[11px] font-display font-black uppercase tracking-[0.3em] transition-all rounded-2xl shadow-xl shadow-red-900/40 active:scale-[0.98] cursor-pointer"
              >
                {dangerAction === 'clearDuplicates' ? 'Confirm Duplicate Cleanup' : 'Confirm Total Data Wipe'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
