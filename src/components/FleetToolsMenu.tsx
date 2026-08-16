import React from 'react';
import { Eye, CheckCircle2, Zap, Tag, Download, FileText, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

interface FleetToolsMenuProps {
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  isAuditMode: boolean;
  setIsAuditMode: (audit: boolean) => void;
  isAuditUploadMode: boolean;
  setIsAuditUploadMode: (auditUpload: boolean) => void;
  setAuditResults: (results: any[]) => void;
  setShowUsageModal: (show: boolean) => void;
  setShowSettingsModal: (show: boolean) => void;
  setShowMarketPricesModal: (show: boolean) => void;
  handleExportData: () => void;
  handleExportPDF: () => void;
  fetchRecords: () => void;
  records: any[];
  isRefreshing: boolean;
}

export const FleetToolsMenu: React.FC<FleetToolsMenuProps> = ({
  showHistory,
  setShowHistory,
  isAuditMode,
  setIsAuditMode,
  isAuditUploadMode,
  setIsAuditUploadMode,
  setAuditResults,
  setShowUsageModal,
  setShowSettingsModal,
  setShowMarketPricesModal,
  handleExportData,
  handleExportPDF,
  fetchRecords,
  records,
  isRefreshing,
}) => {
  return (
    <div className="space-y-8">
      {/* Section: Tools */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="w-1 h-3 bg-emerald-500 rounded-full" />
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-white/40">Fleet Tools</p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button 
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            aria-pressed={showHistory}
            className="w-full p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between hover:bg-white/[0.08] hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-violet-500/10 rounded-xl border border-violet-500/20 group-hover:bg-violet-500/20 transition-all">
                <Eye className={cn("w-4 h-4", showHistory ? "text-violet-400" : "text-white/20")} />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/80">Maintenance Log</span>
                <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">{showHistory ? 'Visible' : 'Hidden'}</span>
              </div>
            </div>
            <div className={cn(
              "w-8 h-4 rounded-full transition-all relative border",
              showHistory ? "bg-violet-500/20 border-violet-500/40" : "bg-white/5 border-white/10"
            )}>
              <div className={cn(
                "absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all",
                showHistory ? "right-0.5 bg-violet-400" : "left-0.5 bg-white/20"
              )} />
            </div>
          </button>

          <button 
            type="button"
            onClick={() => {
              const next = !isAuditMode;
              setIsAuditMode(next);
              if (next) {
                setIsAuditUploadMode(false);
                setAuditResults([]);
              }
            }}
            aria-pressed={isAuditMode}
            className="w-full p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between hover:bg-white/[0.08] hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-cyan-500/10 rounded-xl border border-cyan-500/20 group-hover:bg-cyan-500/20 transition-all">
                <CheckCircle2 className={cn("w-4 h-4", isAuditMode ? "text-cyan-400" : "text-white/20")} />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/80">Audit Verify Mode</span>
                <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">{isAuditMode ? 'Active (Dry Run)' : 'Inactive'}</span>
              </div>
            </div>
            <div className={cn(
              "w-8 h-4 rounded-full transition-all relative border",
              isAuditMode ? "bg-cyan-500/20 border-cyan-500/40" : "bg-white/5 border-white/10"
            )}>
              <div className={cn(
                "absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all",
                isAuditMode ? "right-0.5 bg-cyan-400" : "left-0.5 bg-white/20"
              )} />
            </div>
          </button>

          <button 
            type="button"
            onClick={() => {
              setShowUsageModal(true);
              setShowSettingsModal(false);
            }}
            className="w-full p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between hover:bg-white/[0.08] hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all group text-left cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-green-500/10 rounded-xl border border-green-500/20 group-hover:bg-green-500/20 transition-all">
                <Zap className="w-4 h-4 text-green-500" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/80">Usage Statistics</span>
                <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">Quota & Performance</span>
              </div>
            </div>
          </button>

          <button 
            type="button"
            onClick={() => {
              setShowMarketPricesModal(true);
              setShowSettingsModal(false);
            }}
            className="w-full p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between hover:bg-white/[0.08] hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all group text-left cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20 group-hover:bg-amber-500/20 transition-all">
                <Tag className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/80">Market Database</span>
                <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">Price Reference Logs</span>
              </div>
            </div>
          </button>

          <div className="space-y-2">
            <button 
              type="button"
              onClick={handleExportData}
              disabled={records.length === 0}
              className="w-full p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between hover:bg-white/[0.08] hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all group disabled:opacity-50 cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-purple-500/10 rounded-xl border border-purple-500/20 group-hover:bg-purple-500/20 transition-all">
                  <Download className="w-4 h-4 text-purple-400" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/80">Export Fleet Data</span>
                  <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">Download CSV Report</span>
                </div>
              </div>
            </button>

            <button 
              type="button"
              onClick={handleExportPDF}
              disabled={records.length === 0}
              className="w-full p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between hover:bg-white/[0.08] hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all group disabled:opacity-50 cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-cyan-500/10 rounded-xl border border-cyan-500/20 group-hover:bg-cyan-500/20 transition-all">
                  <FileText className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/80">Save as PDF</span>
                  <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">Generate PDF Document</span>
                </div>
              </div>
            </button>
          </div>

          <button 
            type="button"
            onClick={() => {
              fetchRecords();
              setShowSettingsModal(false);
            }}
            disabled={isRefreshing}
            className="w-full p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between hover:bg-white/[0.08] hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20 group-hover:bg-blue-500/20 transition-all">
                <RefreshCw className={cn("w-4 h-4 text-blue-400", isRefreshing && "animate-spin")} />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/80">Force Cloud Sync</span>
                <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">Manual Data Refresh</span>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Section: Processing Modes */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <div className="w-1 h-3 bg-violet-500 rounded-full" />
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-violet-400/40">Processing Modes</p>
        </div>
        
        <button 
          type="button"
          onClick={() => {
            const next = !isAuditUploadMode;
            setIsAuditUploadMode(next);
            if (next) {
              setIsAuditMode(false);
              setAuditResults([]);
            }
          }}
          aria-pressed={isAuditUploadMode}
          className={cn(
            "w-full p-5 border rounded-3xl flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all group cursor-pointer",
            isAuditUploadMode 
              ? "bg-violet-500/[0.08] border-violet-500/40 shadow-[0_0_20px_rgba(139,92,246,0.1)]" 
              : "bg-white/[0.03] border-white/10 hover:bg-white/[0.08] hover:border-white/20"
          )}
        >
          <div className="flex items-center gap-4">
            <div className={cn(
              "p-3 rounded-2xl border transition-all",
              isAuditUploadMode ? "bg-violet-500/20 border-violet-500/40 shadow-[0_0_10px_rgba(139,92,246,0.3)]" : "bg-white/5 border-white/10"
            )}>
              <Eye className={cn("w-5 h-5", isAuditUploadMode ? "text-violet-400" : "text-white/40")} />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className={cn(
                "text-[11px] font-display font-bold uppercase tracking-[0.2em]",
                isAuditUploadMode ? "text-violet-400" : "text-white/80"
              )}>Audit Upload Mode</span>
              <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest mt-0.5">
                {isAuditUploadMode ? "Skip duplicates, save non-duplicates automatically" : "Save all extracted records to DB"}
              </span>
            </div>
          </div>
          <div className={cn(
            "w-10 h-5 rounded-full relative transition-all p-1",
            isAuditUploadMode ? "bg-violet-600" : "bg-white/10"
          )}>
            <div className={cn(
              "w-3 h-3 bg-white rounded-full transition-all shadow-md",
              isAuditUploadMode ? "translate-x-5" : "translate-x-0"
            )} />
          </div>
        </button>
      </div>
    </div>
  );
};
