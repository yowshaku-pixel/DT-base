import React from 'react';
import { Database, Key, Save, CheckCircle2 } from 'lucide-react';

interface SupabaseSetupProps {
  localSupabaseUrl: string;
  setLocalSupabaseUrl: (url: string) => void;
  localSupabaseAnonKey: string;
  setLocalSupabaseAnonKey: (key: string) => void;
  isSupaSaved: boolean;
  setIsSupaSaved: (saved: boolean) => void;
  setShowSettingsModal: (show: boolean) => void;
  setNotification: (notif: { message: string; type: 'success' | 'warning' | 'info' | 'error' | null }) => void;
}

export const SupabaseSetup: React.FC<SupabaseSetupProps> = ({
  localSupabaseUrl,
  setLocalSupabaseUrl,
  localSupabaseAnonKey,
  setLocalSupabaseAnonKey,
  isSupaSaved,
  setIsSupaSaved,
  setShowSettingsModal,
  setNotification,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <div className="w-1 h-3 bg-cyan-500 rounded-full animate-pulse" />
        <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-white/40">SUPABASE DATABASE SETUP</p>
      </div>
      <div className="p-5 bg-cyan-500/[0.03] border border-cyan-500/20 rounded-3xl space-y-4 shadow-md">
        <p className="text-[9px] text-cyan-300/60 uppercase tracking-widest leading-relaxed">
          Provide your own Supabase credentials to persist your fleet maintenance data directly into your personal database when running on an exported app or device.
        </p>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[8px] font-display font-bold uppercase tracking-wider text-white/40 block ml-1">Supabase Project URL</label>
            <div className="relative">
              <input 
                type="text"
                placeholder="https://your-project-id.supabase.co"
                className="w-full bg-black/60 border border-white/10 p-3.5 pl-11 font-mono text-xs focus:outline-none focus:border-cyan-500/60 text-white rounded-2xl placeholder:text-white/10 transition-all select-all focus:ring-1 focus:ring-cyan-500/30 text-cyan-200"
                value={localSupabaseUrl}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setLocalSupabaseUrl(val);
                }}
              />
              <Database className="w-4 h-4 text-cyan-400 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[8px] font-display font-bold uppercase tracking-wider text-white/40 block ml-1">Supabase Anon Key</label>
            <div className="relative">
              <input 
                type="password"
                placeholder="PASTE ANON KEY..."
                className="w-full bg-black/60 border border-white/10 p-3.5 pl-11 font-mono text-xs focus:outline-none focus:border-cyan-500/60 text-white rounded-2xl placeholder:text-white/10 transition-all select-all focus:ring-1 focus:ring-cyan-500/30 text-cyan-200"
                value={localSupabaseAnonKey}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setLocalSupabaseAnonKey(val);
                }}
              />
              <Key className="w-4 h-4 text-cyan-400 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>

        <button 
          type="button"
          onClick={() => {
            const oldUrl = localStorage.getItem('DTBASE_SUPABASE_URL') || '';
            const oldKey = localStorage.getItem('DTBASE_SUPABASE_ANON_KEY') || '';
            const isSupaConfigChanged = (oldUrl !== localSupabaseUrl.trim()) || (oldKey !== localSupabaseAnonKey.trim());

            if (localSupabaseUrl) {
              localStorage.setItem("DTBASE_SUPABASE_URL", localSupabaseUrl);
            } else {
              localStorage.removeItem("DTBASE_SUPABASE_URL");
            }
            if (localSupabaseAnonKey) {
              localStorage.setItem("DTBASE_SUPABASE_ANON_KEY", localSupabaseAnonKey);
            } else {
              localStorage.removeItem("DTBASE_SUPABASE_ANON_KEY");
            }
            setIsSupaSaved(true);
            setNotification({
              message: "Supabase parameters saved locally! Reloading application...",
              type: "success"
            });
            setTimeout(() => {
              setIsSupaSaved(false);
              setShowSettingsModal(false);
              if (isSupaConfigChanged) {
                window.location.reload();
              }
            }, 1200);
          }}
          className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-display font-bold uppercase tracking-widest text-[10px] rounded-xl transition-all shadow-lg shadow-cyan-900/20 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          Save & Reload Application
        </button>

        {isSupaSaved && (
          <div className="flex items-center gap-1.5 text-[8px] font-mono text-green-400 uppercase tracking-widest">
            <CheckCircle2 className="w-3 h-3 animate-pulse" />
            Parameters updated. Reloading module...
          </div>
        )}
      </div>
    </div>
  );
};
