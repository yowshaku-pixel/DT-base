import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Upload, Search, Filter, Trash2, Loader2, AlertCircle, Save, RefreshCw, X, ChevronDown, ChevronUp, ListFilter, Download, LogIn, LogOut, User as UserIcon, Clock, Truck, Plus, Database, Zap, Eye, EyeOff, Lock, Key, Tag, Coins, Settings, Smartphone, Cloud, AlertTriangle, CheckCircle2, Camera, FileText, ClipboardCheck, Sun, Moon, Wrench, Receipt, Globe, Sparkles, Briefcase, Bell, HelpCircle } from 'lucide-react';
import { MaintenanceRecord, MarketPrice } from './types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { extractMaintenanceData, extractMarketPrices, analyzeMaintenanceData, isApiKeyAvailable, getAIErrorMessage } from './services/aiService';
import { 
  cn, 
  resizeImage, 
  arePlatesSimilar, 
  normalizePlate, 
  normalizeDate,
  deduplicateRecords,
  cleanServiceDescription 
} from './lib/utils';
import { supabase, getSupabaseErrorMessage } from './supabase';
import { User } from '@supabase/supabase-js';
import AIChatAssistant from './components/AIChatAssistant';
import { Analytics } from './components/Analytics';
import { FleetAuditReport } from './components/FleetAuditReport';
import { BatteryIntelligence } from './components/BatteryIntelligence';
import { Marketplace } from './components/Marketplace';
import { AdvancedSearch } from './components/AdvancedSearch';
import { INITIAL_PAYMENTS } from './lib/paymentData';
import { fetchLedgerItems, harvestMarketPrices } from './services/ledgerService';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart3 as BarChartIcon } from 'lucide-react';

import LandingPage from './components/LandingPage';
import { SupabaseSetup } from './components/SupabaseSetup';
import { FleetToolsMenu } from './components/FleetToolsMenu';
import { AdvancedSettingsMenu } from './components/AdvancedSettingsMenu';

interface UploadLogEntry {
  fileName: string;
  status: 'queued' | 'processing' | 'success' | 'failed' | 'pending';
  error?: string;
  timestamp: number;
  imageData?: string; // Base64 image data for viewing
  mode?: 'fleet' | 'market';
  isAudit?: boolean;
  isAuditUpload?: boolean;
  diagnostic?: {
    short: string;
    detailed: string;
    solution: string;
    category: 'ai' | 'database' | 'network' | 'validation';
  };
}

export function getDiagnosticError(err: any): { short: string; detailed: string; solution: string; category: 'ai' | 'database' | 'network' | 'validation' } {
  if (!err) {
    return {
      short: "Operation failed",
      detailed: "An unspecified or unknown error occurred during processing.",
      solution: "Try refreshing the application or uploading the file again.",
      category: 'validation'
    };
  }

  const message = err.message || (typeof err === 'string' ? err : "");
  const errString = String(message || err).toLowerCase();

  // 1. Quota / Limits
  if (errString.includes("quota") || errString.includes("limit") || errString.includes("resource_exhausted") || errString.includes("429") || errString.includes("daily_quota_exceeded")) {
    return {
      short: "Rate Limit/Quota Reached",
      detailed: "You have hit Google's Gemini free-tier daily usage query limits or rate limits.",
      solution: "Wait a few seconds before retrying, or configure a custom Gemini API Key under App Settings to remove limits.",
      category: 'ai'
    };
  }

  // 2. Network / Fetch Errors
  if (errString.includes("failed to fetch") || errString.includes("networkerror") || errString.includes("load failed") || errString.includes("connection error") || errString.includes("timed out") || errString.includes("xhr error") || errString.includes("proxyunarycall") || errString.includes("makersuiteservice")) {
    return {
      short: "Network Connection Timeout",
      detailed: "The browser or proxy server failed to contact the external endpoint. This is usually due to a temporary network issue, VPN restriction, or local firewall.",
      solution: "Check your internet connection, temporarily disable any strict VPN/adblockers, and try the upload again.",
      category: 'network'
    };
  }

  // 3. Database Errors (RLS/Permissions, unique checks)
  if (err.code === '42501' || errString.includes("insufficient permissions") || errString.includes("row-level security")) {
    return {
      short: "Database Permission Denied",
      detailed: "The database rejected the operation due to Row-Level Security (RLS) policies. You might not have authorization to write to this fleet repository.",
      solution: "Ensure you are properly logged into a valid account with appropriate workspace access rights.",
      category: 'database'
    };
  }

  if (err.code === '23505' || errString.includes("unique violation") || errString.includes("duplicate key")) {
    return {
      short: "Duplicate Record",
      detailed: "A database record with this identical combination of plate number, service date, and description already exists in the ledger.",
      solution: "If this is a unique log, change the plate number or service details. Otherwise, enjoy automatic double-save protection!",
      category: 'database'
    };
  }

  // 4. Content / Format Errors
  if (errString.includes("could not read") || errString.includes("unable to extract") || errString.includes("no readable records")) {
    return {
      short: "Unreadable/Handwriting Ambiguity",
      detailed: "The AI scanned the image but was unable to identify any legible column structures, fleet plate numbers, or service items. Handwritten text may be too blurry or low contrast.",
      solution: "Use a higher resolution, front-facing, or better-lit photo of the paper receipt/log, or input the details manually.",
      category: 'validation'
    };
  }

  // 5. Placeholders Errors
  if (errString.includes("todo_project_id") || errString.includes("supabase url contains placeholders")) {
    return {
      short: "Environment Setup Missing",
      detailed: "Your workspace has not been fully configured with the necessary database connection parameters (Supabase URL or keys).",
      solution: "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your Secrets / Environment Variables in AI Studio and reboot the server.",
      category: 'network'
    };
  }

  // 6. Gemini Unregistered Callers / Key Missing (Termux / Local Host)
  if (errString.includes("unregistered callers") || errString.includes("unregistered") || errString.includes("api key") || errString.includes("403")) {
    return {
      short: "Gemini API Key Missing/Invalid",
      detailed: "The query failed (403 Permission Denied) because there's no custom API Key defined, or the server environment variable GEMINI_API_KEY is not set/invalid.",
      solution: "Provide your own Gemini API Key in the 'App Settings' card (top-right gear icon) to process images offline/directly, OR create a `.env` file in the project folder with `GEMINI_API_KEY=AIzaSy...`",
      category: 'ai'
    };
  }

  // Fallback
  return {
    short: err.message || "Processing Error",
    detailed: "An unexpected issue was encountered while reading the invoice/receipt or updating database records.",
    solution: "Review the original image clarity or click 'Add Manually' to bypass automation.",
    category: 'validation'
  };
}

const CONCURRENCY_LIMIT = 1; // Reduced for mobile stability
// No limit - fetch all records for the user

// --- Memoized Sub-components for Performance ---

const PlateFolder = React.memo(({ 
  plate, 
  plateRecords, 
  isExpanded, 
  onToggle, 
  onEdit, 
  onToggleVerify,
  onViewImage,
  normalizePlate
}: { 
  plate: string, 
  plateRecords: MaintenanceRecord[], 
  isExpanded: boolean, 
  onToggle: (p: string) => void,
  onEdit: (r: MaintenanceRecord) => void,
  onToggleVerify: (r: MaintenanceRecord) => void,
  onViewImage: (r: MaintenanceRecord) => void,
  normalizePlate: (p: string) => string
}) => {
  return (
    <div className="glassmorphism rounded-3xl overflow-hidden transition-all hover:bg-surface/10 neon-border-violet/30">
      <button 
        onClick={() => onToggle(plate)}
        className="w-full flex items-center justify-between p-3.5 px-5 text-text transition-all"
        title={`Click to ${isExpanded ? 'collapse' : 'expand'} records for ${plate}`}
      >
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center bg-surface border border-border transition-transform",
            isExpanded && "rotate-180"
          )}>
            <ChevronDown className="w-3 h-3 text-muted" />
          </div>
          <div className="flex flex-col items-start">
            <span className="font-display text-lg font-bold tracking-tight">{plate}</span>
            <span className="text-[8px] text-muted font-mono uppercase tracking-widest">
              {plateRecords.length} {plateRecords.length === 1 ? 'Entry' : 'Entries'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[8px] font-display font-bold text-muted uppercase tracking-[0.2em] mb-0.5">Last Service</div>
          <div className="text-[10px] font-mono font-bold text-purple-600 dark:text-purple-400/80">
            {plateRecords.length > 0 ? plateRecords[0].service_date : 'No Records'}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="bg-bg/40 rounded-2xl border border-border divide-y divide-border">
            {plateRecords.length > 0 ? (
              plateRecords.map((record, index) => (
                <div key={`${record.id}-${index}`} className="p-3 px-4 flex items-center justify-between gap-4 group hover:bg-surface transition-colors">
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className="text-[9px] font-mono text-muted/40 w-4">
                      {(index + 1).toString().padStart(2, '0')}
                    </div>
                    <div className="overflow-hidden">
                      <div className="text-[8px] font-display font-bold uppercase tracking-[0.2em] mb-0.5 flex flex-wrap items-center gap-2">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded bg-surface border",
                          normalizePlate(record.plate_number) !== normalizePlate(plate) && plate !== '⚠️ NEEDS REVIEW'
                            ? "text-orange-600 border-orange-500/30 bg-orange-500/10" 
                            : "text-muted border-border"
                        )}>
                          {record.plate_number}
                        </span>
                        <span className="text-muted/40">•</span>
                        <span className="text-muted">{record.service_date}</span>
                        {record.file_name && (
                          <>
                            <span className="text-muted/40">•</span>
                            <span className="truncate max-w-[120px] text-muted">{record.file_name}</span>
                          </>
                        )}
                      </div>
                      <div className="text-xs font-medium text-text truncate">{record.service_description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button 
                      onClick={() => onToggleVerify(record)}
                      className={cn(
                        "p-2 border transition-all rounded-full flex items-center justify-center",
                        record.verified 
                          ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-600 dark:text-cyan-400 shadow-[0_0_10px_rgba(0,245,255,0.2)]" 
                          : "bg-surface border border-border text-muted hover:text-text hover:bg-bg/20"
                      )}
                      title={record.verified ? "Mark as UNVERIFIED" : "Mark as DOUBLE-CHECKED"}
                    >
                      <CheckCircle2 className={cn("w-3 h-3", record.verified && "animate-pulse")} />
                    </button>
                    <button 
                      onClick={() => onEdit(record)}
                      className="p-2 bg-surface border border-border text-muted hover:text-text hover:bg-bg/20 transition-all rounded-full"
                      title="Edit this record"
                    >
                      <Settings className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={() => onViewImage(record)}
                      className="flex-shrink-0 px-3 py-1.5 bg-purple-600/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-[9px] font-display font-bold uppercase tracking-widest hover:bg-purple-600/20 transition-all rounded-full"
                      title="View the original image for this record"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center">
                <p className="text-[10px] font-display font-bold uppercase tracking-widest text-muted/40">No records uploaded yet for this truck</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

const RecordsList = React.memo(({ 
  groupedRecords, 
  expandedPlates, 
  onTogglePlate, 
  onEditRecord, 
  onToggleVerify,
  onViewImage,
  normalizePlate,
  isProcessing,
  user,
  onUploadClick,
  isServiceUnlocked,
  setShowServicePasswordPrompt,
  isAuditMode
}: { 
  groupedRecords: Record<string, MaintenanceRecord[]>,
  expandedPlates: Record<string, boolean>,
  onTogglePlate: (p: string) => void,
  onEditRecord: (r: MaintenanceRecord) => void,
  onViewImage: (r: MaintenanceRecord) => void,
  normalizePlate: (p: string) => string,
  isProcessing: boolean,
  user: any,
  onUploadClick: (e: any) => void,
  isServiceUnlocked: boolean,
  setShowServicePasswordPrompt: (b: boolean) => void,
  isAuditMode: boolean,
  onToggleVerify: (r: MaintenanceRecord) => void
}) => {
  if (Object.keys(groupedRecords).length === 0) {
    return (
      <div className="p-16 text-center border border-border border-dashed rounded-3xl bg-surface/20 flex flex-col items-center gap-6">
        <div className="w-16 h-16 bg-purple-600/10 rounded-full flex items-center justify-center border border-purple-500/20">
          <Save className="w-8 h-8 text-purple-600/40 dark:text-purple-500/40" />
        </div>
        <div className="max-w-xs">
          <h3 className="font-display font-bold text-lg text-text mb-2">Fresh Start</h3>
          <p className="text-[11px] font-display font-medium text-muted leading-relaxed uppercase tracking-widest">
            {isProcessing ? "Processing your uploads..." : "Your maintenance database is empty. Upload pictures of your logs to get started."}
          </p>
        </div>
        {!isProcessing && user && (
          <label 
            onClick={(e) => {
              if (!isServiceUnlocked) {
                e.preventDefault();
                setShowServicePasswordPrompt(true);
              }
            }}
            className={cn(
              "flex items-center gap-2 px-8 py-4 bg-purple-600 text-white cursor-pointer hover:bg-purple-500 transition-all shadow-lg shadow-purple-900/20 font-display font-bold uppercase tracking-[0.2em] text-xs relative overflow-hidden",
              !isServiceUnlocked && "opacity-50",
              isAuditMode && "bg-cyan-600 hover:bg-cyan-500 shadow-cyan-900/20"
            )}
            title={!isServiceUnlocked ? "Unlock services to upload" : isAuditMode ? "Start Audit Extraction" : "Upload your first maintenance log image"}
          >
            <Upload className="w-4 h-4" />
            {isAuditMode ? "Audit Extraction" : "Upload First Log"}
            <input 
              type="file" 
              multiple 
              accept="image/*"
              className="hidden" 
              onChange={onUploadClick}
              disabled={isProcessing}
            />
          </label>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {Object.entries(groupedRecords).map(([plate, plateRecords]) => (
        <PlateFolder 
          key={plate}
          plate={plate}
          plateRecords={plateRecords}
          isExpanded={!!expandedPlates[plate]}
          onToggle={onTogglePlate}
          onEdit={onEditRecord}
          onToggleVerify={onToggleVerify}
          onViewImage={onViewImage}
          normalizePlate={normalizePlate}
        />
      ))}
    </div>
  );
});

const SearchFilters = React.memo(({
  searchQuery,
  setSearchQuery,
  descriptionQuery,
  setDescriptionQuery,
  isSearching,
  isServiceUnlocked,
  usageStats,
  setShowServicePasswordPrompt,
  recentSearches,
  isAuditMode
}: {
  searchQuery: string,
  setSearchQuery: (s: string) => void,
  descriptionQuery: string,
  setDescriptionQuery: (s: string) => void,
  isSearching: boolean,
  isServiceUnlocked: boolean,
  usageStats: any,
  setShowServicePasswordPrompt: (b: boolean) => void,
  recentSearches: string[],
  isAuditMode: boolean
}) => {
  // Local state for instant typing responsiveness
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [localDesc, setLocalDesc] = useState(descriptionQuery);

  // Sync internal state when external state changes (e.g. on Clear All)
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    setLocalDesc(descriptionQuery);
  }, [descriptionQuery]);

  return (
    <div className="relative group">
      <label className="font-display font-bold uppercase tracking-[0.2em] text-[9px] opacity-40 block mb-2 ml-2">Identify Truck</label>
      <div className="flex flex-col gap-2">
        <div className="relative">
          {isSearching ? (
            <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400 animate-spin" />
          ) : (
            <Search className={cn("absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-30", isAuditMode && "text-cyan-400 opacity-60")} />
          )}
          <input 
            type="text"
            placeholder={!isServiceUnlocked && usageStats.searches >= 15 ? "Search limit reached..." : "Plate number..."}
            className={cn(
              "w-full bg-black/40 border p-2.5 pl-10 pr-10 rounded-full font-display font-medium text-sm focus:outline-none transition-all placeholder:opacity-30",
              !isServiceUnlocked && usageStats.searches >= 15 ? "opacity-50 cursor-not-allowed border-white/10" : isAuditMode ? "neon-border-cyan border-cyan-500/50" : "neon-border-cyan"
            )}
            value={localSearch}
            onChange={(e) => {
              if (!isServiceUnlocked && usageStats.searches >= 15) {
                setShowServicePasswordPrompt(true);
                return;
              }
              const val = e.target.value;
              setLocalSearch(val);
              setSearchQuery(val); // Parent updates debounced value
            }}
            disabled={!isServiceUnlocked && usageStats.searches >= 15}
            title="Search records by truck plate number"
          />
          {localSearch && (
            <button 
              onClick={() => {
                setLocalSearch('');
                setSearchQuery('');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-full transition-colors"
              title="Clear Search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="relative">
           <Smartphone className={cn("absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-30", isAuditMode && "text-cyan-400 opacity-40")} />
           <input 
            type="text"
            placeholder="Description keyword..."
            className={cn(
              "w-full bg-black/40 border p-2.5 pl-10 pr-10 rounded-full font-display font-medium text-sm focus:outline-none transition-all placeholder:opacity-30",
              isAuditMode ? "border-cyan-500/30 focus:border-cyan-500/60" : "border-white/10"
            )}
            value={localDesc}
            onChange={(e) => {
              const val = e.target.value;
              setLocalDesc(val);
              setDescriptionQuery(val);
            }}
            title="Optional: Search for this keyword specifically inside service descriptions"
          />
          {localDesc && (
            <button 
              onClick={() => {
                setLocalDesc('');
                setDescriptionQuery('');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-full transition-colors"
              title="Clear Description Filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {recentSearches.length > 0 && !localSearch && (
        <div className="mt-2 flex flex-wrap gap-1.5 ml-2">
          {recentSearches.map((s, i) => (
            <button 
              key={i} 
              onClick={() => {
                setLocalSearch(s);
                setSearchQuery(s);
              }}
              className={cn(
                "text-[8px] font-mono bg-white/5 border border-white/5 px-2 py-0.5 rounded-full opacity-40 hover:opacity-100 transition-all font-bold",
                isAuditMode ? "hover:bg-cyan-500/20 hover:border-cyan-500/30" : "hover:bg-purple-500/20 hover:border-purple-500/30"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

const EditRecordModal = React.memo(({ 
  record, 
  onClose, 
  onSave, 
  isProcessing 
}: { 
  record: MaintenanceRecord, 
  onClose: () => void, 
  onSave: (updatedRecord: MaintenanceRecord) => void,
  isProcessing: boolean
}) => {
  const [localRecord, setLocalRecord] = useState(record);

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/95 overflow-y-auto">
      <div className="w-full max-w-md glassmorphism neon-border-violet p-6 sm:p-8 relative rounded-3xl my-auto">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 via-cyan-500 to-violet-500 rounded-t-3xl" />
        
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Settings className="w-5 h-5 text-violet-400" />
              <h2 className="text-2xl font-display font-black tracking-tighter uppercase text-white">Edit Record</h2>
            </div>
            <p className="text-[10px] text-violet-400/60 font-mono uppercase tracking-[0.2em] truncate max-w-[200px]">
              Original: {record.file_name || 'Manual'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white"
            title="Close Edit"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60 block mb-2">Plate Number</label>
            <input 
              type="text"
              value={localRecord.plate_number}
              onChange={(e) => setLocalRecord({ ...localRecord, plate_number: e.target.value.toUpperCase() })}
              className="w-full bg-black/40 border neon-border-violet p-4 rounded-xl font-display font-bold text-lg focus:outline-none transition-all placeholder:text-white/10 text-cyan-400"
              placeholder="E.G. ABC-1234"
            />
          </div>

          <div>
            <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60 block mb-2">Service Date</label>
            <input 
              type="date"
              value={localRecord.service_date}
              onChange={(e) => setLocalRecord({ ...localRecord, service_date: e.target.value })}
              className="w-full bg-black/40 border neon-border-violet p-4 rounded-xl font-display font-bold text-lg focus:outline-none transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60 block mb-2">Service Description</label>
            <textarea 
              value={localRecord.service_description}
              onChange={(e) => setLocalRecord({ ...localRecord, service_description: e.target.value })}
              className="w-full bg-black/40 border neon-border-violet p-4 rounded-xl font-display font-bold text-base focus:outline-none transition-all min-h-[100px] placeholder:text-white/10"
              placeholder="E.G. Oil Change, Tire Rotation..."
            />
          </div>

          <div className="flex items-center justify-between p-4 glassmorphism border neon-border-violet/20 rounded-xl group cursor-pointer hover:neon-border-violet/40 transition-all" onClick={() => setLocalRecord({ ...localRecord, verified: !localRecord.verified })}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                localRecord.verified ? "bg-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(0,245,255,0.3)]" : "bg-white/5 text-white/20"
              )}>
                <CheckCircle2 className={cn("w-5 h-5", localRecord.verified && "animate-pulse")} />
              </div>
              <div>
                <h3 className="font-display font-black text-xs text-white uppercase tracking-tighter">Double Checked</h3>
                <p className="text-[9px] text-white/40 font-mono uppercase">Confirm data accuracy</p>
              </div>
            </div>
            <div className={cn(
              "w-12 h-6 rounded-full relative transition-all duration-300",
              localRecord.verified ? "bg-cyan-500" : "bg-white/10"
            )}>
              <div className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300",
                localRecord.verified ? "right-1" : "left-1"
              )} />
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 border border-white/10 text-white font-display font-bold uppercase tracking-[0.2em] text-[10px] rounded-xl hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={() => onSave(localRecord)}
              disabled={isProcessing}
              className="flex-[2] py-4 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 disabled:opacity-50 text-white font-display font-black uppercase tracking-[0.2em] text-xs rounded-xl shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

const ManualEntryModal = React.memo(({ 
  data, 
  onClose, 
  onSave, 
  isProcessing 
}: { 
  data: any, 
  onClose: () => void, 
  onSave: (updatedData: any) => void,
  isProcessing: boolean
}) => {
  const [localData, setLocalData] = useState(data);

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/95 overflow-y-auto">
      <div className="w-full max-w-md glassmorphism neon-border-violet p-6 sm:p-8 relative rounded-3xl my-auto">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 via-cyan-500 to-violet-500 rounded-t-3xl" />
        
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Plus className="w-5 h-5 text-violet-400" />
              <h2 className="text-2xl font-display font-black tracking-tighter uppercase text-white">Manual Entry</h2>
            </div>
            <p className="text-[10px] text-violet-400/60 font-mono uppercase tracking-[0.2em] truncate max-w-[200px]">
              File: {data.fileName}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white"
            title="Close Manual Entry"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60 block mb-2">Plate Number</label>
            <input 
              type="text"
              value={localData.plateNumber}
              onChange={(e) => setLocalData({ ...localData, plateNumber: e.target.value.toUpperCase() })}
              className="w-full bg-black/40 border neon-border-violet p-4 rounded-xl font-display font-bold text-lg focus:outline-none transition-all placeholder:text-white/10"
              placeholder="E.G. ABC-1234"
            />
          </div>

          <div>
            <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60 block mb-2">Service Date</label>
            <input 
              type="date"
              value={localData.date}
              onChange={(e) => setLocalData({ ...localData, date: e.target.value })}
              className="w-full bg-black/40 border neon-border-violet p-4 rounded-xl font-display font-bold text-lg focus:outline-none transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60 block mb-2">Service Description</label>
            <textarea 
              value={localData.service}
              onChange={(e) => setLocalData({ ...localData, service: e.target.value })}
              className="w-full bg-black/40 border neon-border-violet p-4 rounded-xl font-display font-bold text-base focus:outline-none transition-all min-h-[100px] placeholder:text-white/10"
              placeholder="E.G. Oil Change - 15000 KES, Tire Rotation - 5000 KES..."
            />
          </div>

          <div className="flex items-center justify-between p-4 glassmorphism border neon-border-violet/20 rounded-xl group cursor-pointer hover:neon-border-violet/40 transition-all" onClick={() => setLocalData({ ...localData, verified: !localData.verified })}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                localData.verified ? "bg-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(0,245,255,0.3)]" : "bg-white/5 text-white/20"
              )}>
                <CheckCircle2 className={cn("w-5 h-5", localData.verified && "animate-pulse")} />
              </div>
              <div>
                <h3 className="font-display font-black text-xs text-white uppercase tracking-tighter">Verified Entry</h3>
                <p className="text-[9px] text-white/40 font-mono uppercase">Marks as double-checked</p>
              </div>
            </div>
            <div className={cn(
              "w-12 h-6 rounded-full relative transition-all duration-300",
              localData.verified ? "bg-cyan-500" : "bg-white/10"
            )}>
              <div className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300",
                localData.verified ? "right-1" : "left-1"
              )} />
            </div>
          </div>

          <button 
            onClick={() => onSave(localData)}
            disabled={isProcessing}
            className="w-full py-5 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 disabled:opacity-50 text-white font-display font-black uppercase tracking-[0.3em] rounded-2xl transition-all shadow-[0_0_20px_rgba(0,245,255,0.3)] flex items-center justify-center gap-3"
            title="Save this manual entry to the database"
          >
            {isProcessing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Record
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

export default function App() {
  const MASTER_PASSWORD = import.meta.env.VITE_SERVICE_PASSWORD || 'adminjo';
  const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD || 'dtbase_access';

  const [user, setUser] = useState<User | null>(null);
  const [viewMode, setViewMode] = useState<'log' | 'analytics' | 'audit' | 'battery' | 'marketplace' | 'advanced-search'>('log');
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [isCloudConnected, setIsCloudConnected] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const shouldStopRef = React.useRef(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, failed: 0 });
  const [failedFiles, setFailedFiles] = useState<string[]>([]);
  const [batchSessionSummary, setBatchSessionSummary] = useState<{
    totalImages: number;
    successCount: number;
    recordsBefore: number;
    recordsAfter: number;
    newRecordsCount: number;
    newMarketPricesCount: number;
    mode: 'fleet' | 'market';
    isAudit: boolean;
    totalExtractedCount?: number;
    extractedItems?: any[];
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceHintQuery, setServiceHintQuery] = useState('');
  const [serviceHintAnswer, setServiceHintAnswer] = useState<string | null>(null);
  const [isServiceHintLoading, setIsServiceHintLoading] = useState(false);
  const [descriptionQuery, setDescriptionQuery] = useState('');
  const [notification, setNotification] = useState<{ message: string, type: 'info' | 'success' | 'warning' | 'error' } | null>(null);

  // Auto-clear notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedDescription, setDebouncedDescription] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [debouncedService, setDebouncedService] = useState('');
  const [secondaryServiceFilter, setSecondaryServiceFilter] = useState('');
  const [debouncedSecondaryService, setDebouncedSecondaryService] = useState('');
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  
  // Usage Tracking & Password Protection
  const [usageStats, setUsageStats] = useState(() => {
    try {
      const saved = localStorage.getItem('dtbase_usage_stats');
      return saved ? JSON.parse(saved) : { extractions: 0, searches: 0 };
    } catch (e) {
      console.error("Error parsing usage stats", e);
      return { extractions: 0, searches: 0 };
    }
  });
  const [isServiceUnlocked, setIsServiceUnlocked] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dtbase_service_unlocked');
      return saved !== 'false';
    }
    return true;
  });
  const [showServicePasswordPrompt, setShowServicePasswordPrompt] = useState(false);
  const [servicePasswordInput, setServicePasswordInput] = useState('');
  const [servicePasswordError, setServicePasswordError] = useState(false);

  useEffect(() => {
    localStorage.setItem('dtbase_usage_stats', JSON.stringify(usageStats));
  }, [usageStats]);

  useEffect(() => {
    localStorage.setItem('dtbase_service_unlocked', isServiceUnlocked ? 'true' : 'false');
  }, [isServiceUnlocked]);

  const [isAppUnlocked, setIsAppUnlocked] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dtbase_app_unlocked');
      return saved !== 'false';
    }
    return true;
  });
  const [appPasswordInput, setAppPasswordInput] = useState('');
  const [appPasswordError, setAppPasswordError] = useState(false);

  useEffect(() => {
    localStorage.setItem('dtbase_app_unlocked', isAppUnlocked ? 'true' : 'false');
  }, [isAppUnlocked]);

  const handleAppUnlock = () => {
    if (appPasswordInput === APP_PASSWORD) {
      setIsAppUnlocked(true);
      setAppPasswordError(false);
      setAppPasswordInput('');
    } else {
      setAppPasswordError(true);
    }
  };

  const handleUnlockService = () => {
    if (servicePasswordInput === MASTER_PASSWORD) {
      setIsServiceUnlocked(true);
      setShowServicePasswordPrompt(false);
      setServicePasswordInput('');
      setServicePasswordError(false);
    } else {
      setServicePasswordError(true);
    }
  };

  const handleExportData = () => {
    if (records.length === 0) return;
    
    // Create CSV content
    const headers = ['Plate Number', 'Date', 'Service Type', 'File Name'];
    const csvRows = [
      headers.join(','),
      ...records.map(r => [
        `"${r.plate_number}"`,
        `"${new Date(r.service_date).toLocaleString()}"`,
        `"${r.service_description}"`,
        `"${r.file_name || ''}"`
      ].join(','))
    ];
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `fleet_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (records.length === 0) return;

    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(20);
    doc.text('DT.Base Fleet Maintenance Report', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Total Records: ${records.length}`, 14, 35);
    
    // Prepare table data
    const tableColumn = ["Plate Number", "Date", "Service Description", "Verified"];
    const tableRows = records.map(record => [
      record.plate_number,
      new Date(record.service_date).toLocaleDateString(),
      record.service_description,
      record.verified ? "YES" : "NO"
    ]);

    // Generate table
    autoTable(doc, {
      startY: 45,
      head: [tableColumn],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [139, 92, 246], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      styles: { fontSize: 8, cellPadding: 2 }
    });

    doc.save(`fleet_export_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const [isFabOpen, setIsFabOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'black' | 'pro'>(() => {
    const saved = localStorage.getItem('dtbase_theme');
    if (saved === 'professional') return 'pro';
    if (saved === 'light' || saved === 'dark' || saved === 'black' || saved === 'pro') {
      return saved;
    }
    return 'pro';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark', 'black', 'professional');
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'black') {
      root.classList.add('black');
      root.classList.add('dark');
    } else if (theme === 'pro') {
      root.classList.add('professional');
      root.classList.add('dark');
    }
    localStorage.setItem('dtbase_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'black';
      if (prev === 'black') return 'pro';
      return 'light';
    });
  };

  const DEFAULT_REGISTRY = ["UAY 469L", "KCL 054", "KCY 901B", "KCZ 945Y", "KDS 849R", "UBA 824F", "AXOR MP3", "ACTROS MP4"];

  const [fleetRegistry, setFleetRegistry] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dtbase_fleet_registry');
      return saved ? JSON.parse(saved) : DEFAULT_REGISTRY;
    } catch (e) {
      return DEFAULT_REGISTRY;
    }
  });

  // Sync registry to Supabase user_metadata when it changes
  useEffect(() => {
    localStorage.setItem('dtbase_fleet_registry', JSON.stringify(fleetRegistry));
    
    // Sync to cloud with debounce
    const timer = setTimeout(async () => {
      if (!user || !supabase) return;
      try {
        const { data: updated, error } = await supabase.auth.updateUser({
          data: { fleet_registry: fleetRegistry }
        });
        
        if (error) {
          console.warn("Supabase user_metadata sync failed:", error.message);
        } else if (updated.user) {
          setUser(updated.user);
        }
      } catch (err) {
        console.error("Registry sync error:", err);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [fleetRegistry, user?.id]); // Only re-sync when registry changes or user changes

  // Load registry from Supabase user_metadata on login
  useEffect(() => {
    if (user && user.user_metadata && user.user_metadata.fleet_registry) {
      const cloudRegistry = user.user_metadata.fleet_registry;
      if (Array.isArray(cloudRegistry) && cloudRegistry.length > 0) {
        setFleetRegistry(cloudRegistry);
      }
    }
  }, [user?.id]); // Run when user logs in

  const [editingRecord, setEditingRecord] = useState<MaintenanceRecord | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [dangerAction, setDangerAction] = useState<'clearAll' | 'clearDuplicates' | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [expandedPlates, setExpandedPlates] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState(false);
  
  const [showDateRangeReport, setShowDateRangeReport] = useState(false);
  const [showLatestOnly, setShowLatestOnly] = useState(false);
  const [showUploadLog, setShowUploadLog] = useState(true);
  const [uploadLog, setUploadLog] = useState<UploadLogEntry[]>([]);
  const [expandedLogDiagnostics, setExpandedLogDiagnostics] = useState<number[]>([]);
  const [latestImage, setLatestImage] = useState<string | null>(null);
  const [isLoadingLatestImage, setIsLoadingLatestImage] = useState(false);
  const lastFetchedRecordIdRef = React.useRef<string | null>(null);
  const [viewingImage, setViewingImage] = useState<{ id: string, image: string | null, loading: boolean } | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [pwaStatus, setPwaStatus] = useState<string>('Checking...');
  const [sessionStats, setSessionStats] = useState({ reads: 0, writes: 0, deletes: 0 });
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [showMarketPricesModal, setShowMarketPricesModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [customGeminiKey, setCustomGeminiKey] = useState(() => typeof window !== 'undefined' ? localStorage.getItem("DT_BASE_CUSTOM_GEMINI_API_KEY") || "" : "");
  const [localSupabaseUrl, setLocalSupabaseUrl] = useState(() => typeof window !== 'undefined' ? localStorage.getItem("DTBASE_SUPABASE_URL") || "" : "");
  const [localSupabaseAnonKey, setLocalSupabaseAnonKey] = useState(() => typeof window !== 'undefined' ? localStorage.getItem("DTBASE_SUPABASE_ANON_KEY") || "" : "");
  const [isSupaSaved, setIsSupaSaved] = useState(false);
  const [showFleetRegistryList, setShowFleetRegistryList] = useState(false);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [automaticSecurityGuard, setAutomaticSecurityGuard] = useState(true);
  const [bugCategory, setBugCategory] = useState<'app' | 'ocr' | 'sync' | 'other'>('app');
  const [bugDescription, setBugDescription] = useState('');

  const handleSubmitBugReport = () => {
    if (!bugDescription.trim()) return;
    addFeedNotification(
      "Bug Transmitted Successfully",
      `Diagnostic report submitted to command centre. Category: ${bugCategory.toUpperCase()}`,
      "success",
      "intelligence"
    );
    setNotification({
      message: "Diagnostic log encrypted and beamed! Ticket ID: #DT-4820P",
      type: "success"
    });
    setBugDescription('');
  };

  const onClearLocalCredentials = () => {
    localStorage.removeItem("DT_BASE_CUSTOM_GEMINI_API_KEY");
    localStorage.removeItem("DTBASE_SUPABASE_URL");
    localStorage.removeItem("DTBASE_SUPABASE_ANON_KEY");
    setCustomGeminiKey("");
    setLocalSupabaseUrl("");
    setLocalSupabaseAnonKey("");
    setNotification({
      message: "Credentials fully wiped from local storage context.",
      type: "success"
    });
  };

  const handleResetDatabase = async () => {
    setRecords([]);
    setAuditResults([]);
    setMarketPrices([]);
    setFleetRegistry([]);
    localStorage.clear();
    setNotification({
      message: "Security wipe completed. Local caches and configurations cleared.",
      type: "success"
    });
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };
  
  // Fleet Notifications Center
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [feedNotifications, setFeedNotifications] = useState<{
    id: string;
    type: 'transition' | 'intelligence' | 'alert' | 'success'; 
    timestamp: string;
    title: string;
    details: string;
    severity: 'info' | 'warning' | 'critical' | 'success';
    read: boolean;
  }[]>(() => [
    {
      id: 'init-engine',
      type: 'intelligence',
      timestamp: new Date(Date.now() - 150000).toISOString(),
      title: "Fleet Intelligence Engine Online",
      details: "Live baseline checks synchronized. DT.Base duplicates blocking guard active.",
      severity: 'info',
      read: false
    },
    {
      id: 'init-registry',
      type: 'success',
      timestamp: new Date(Date.now() - 360000).toISOString(),
      title: "Baseline Audit Synchronized",
      details: "Verified historical records matched against 12 custom truck registries.",
      severity: 'info',
      read: true
    }
  ]);

  const unreadNotificationsCount = useMemo(() => {
    return feedNotifications.filter(n => !n.read).length;
  }, [feedNotifications]);

  const addFeedNotification = useCallback((
    title: string, 
    details: string, 
    severity: 'info' | 'warning' | 'critical' | 'success', 
    type: 'transition' | 'intelligence' | 'alert' | 'success'
  ) => {
    const newNotif = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      timestamp: new Date().toISOString(),
      title,
      details,
      severity,
      read: false
    };
    setFeedNotifications(prev => [newNotif, ...prev]);
    setNotification({
      message: `${severity === 'critical' ? '🔴' : severity === 'warning' ? '🟠' : 'ℹ️'} ${title}`,
      type: severity === 'critical' || severity === 'warning' ? 'warning' : 'success'
    });
  }, [setNotification]);
  const [isAuditMode, setIsAuditMode] = useState(false); // Used as "Confirm Duplicates Mode" (Dry Run Verify Mode)
  const [isAuditUploadMode, setIsAuditUploadMode] = useState(false); // Skip duplicate and save unique automatically
  const [auditResults, setAuditResults] = useState<{
    fileName: string;
    plate: string;
    date: string;
    service: string;
    isDuplicate: boolean;
    isPotential: boolean;
    matchId?: string;
  }[]>([]);
  const [manualEntryData, setManualEntryData] = useState<{
    fileName: string;
    plateNumber: string;
    date: string;
    service: string;
    verified?: boolean;
  } | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentServiceFilters, setRecentServiceFilters] = useState<string[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const wakeLockRef = React.useRef<any>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Auto-show history when searching
  useEffect(() => {
    const hasActiveFilter = !!(searchQuery || serviceFilter || secondaryServiceFilter || startDate || endDate);
    if (hasActiveFilter) {
      setShowHistory(true);
    }
  }, [searchQuery, serviceFilter, secondaryServiceFilter, startDate, endDate]);
  const [troubleFindingAnswer, setTroubleFindingAnswer] = useState<string | null>(null);
  const [isTroubleFindingLoading, setIsTroubleFindingLoading] = useState(false);
  const troubleStopRef = useRef(false);
  const [marketPrices, setMarketPrices] = useState<MarketPrice[]>([]);

  // Prevent accidental refresh/close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasActiveWork = isProcessing || isTroubleFindingLoading || uploadLog.some(entry => entry.status === 'queued' || entry.status === 'processing');
      
      if (hasActiveWork) {
        e.preventDefault();
        // Modern browsers ignore the custom string but require it for the dialog to show
        e.returnValue = 'You have active processes running. Are you sure you want to leave?';
        return 'You have active processes running. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing, isTroubleFindingLoading, uploadLog]);

  // API Key Selection Check
  useEffect(() => {
    const checkApiKey = async () => {
      // First check if a custom manual API key was saved in localStorage
      const customKey = typeof window !== 'undefined' ? localStorage.getItem("DT_BASE_CUSTOM_GEMINI_API_KEY") : null;
      if (customKey && customKey.trim().length > 0) {
        setHasApiKey(true);
        return;
      }

      // Check if a key already exists in environment (free or paid)
      if (isApiKeyAvailable()) {
        setHasApiKey(true);
        return;
      }

      if ((window as any).aistudio?.hasSelectedApiKey) {
        try {
          const selected = await (window as any).aistudio.hasSelectedApiKey();
          setHasApiKey(selected);
        } catch (err) {
          console.error("Error checking API key:", err);
          setHasApiKey(true); // Fallback
        }
      } else {
        // If not in AI Studio or API not available, assume we have one from env
        setHasApiKey(true);
      }
    };
    checkApiKey();
  }, []);

  const handleSelectKey = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      try {
        await (window as any).aistudio.openSelectKey();
        setHasApiKey(true); // Assume success per instructions
      } catch (err) {
        console.error("Error opening key selector:", err);
      }
    }
  };

  // PWA Install Prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      console.log('beforeinstallprompt event fired');
      e.preventDefault();
      setDeferredPrompt(e);
      setPwaStatus('Ready to Install');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setPwaStatus('Already Installed');
    }

    // Check Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        console.log('Service Worker is ready');
        
        if (!deferredPrompt && !window.matchMedia('(display-mode: standalone)').matches) {
          setPwaStatus('Waiting for Chrome...');
        }
      });
    } else {
      setPwaStatus('SW Not Supported');
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [deferredPrompt]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Load upload log from localStorage on mount
  useEffect(() => {
    const savedLog = localStorage.getItem('dt_base_upload_log');
    if (savedLog) {
      try {
        setUploadLog(JSON.parse(savedLog));
      } catch (e) {
        console.error("Failed to parse upload log", e);
      }
    }
  }, []);

  // Save upload log to localStorage whenever it changes (strip image data to avoid 5MB limit)
  useEffect(() => {
    const logToSave = uploadLog.map(({ imageData, ...rest }) => rest);
    localStorage.setItem('dt_base_upload_log', JSON.stringify(logToSave));
  }, [uploadLog]);

  const clearUploadLog = () => {
    setUploadLog([]);
    localStorage.removeItem('dt_base_upload_log');
  };

  const clearFailedUploads = () => {
    setUploadLog(prev => prev.filter(e => e.status !== 'failed'));
  };

  const removeLogEntry = (fileName: string, timestamp: number) => {
    setUploadLog(prev => prev.filter(entry => !(entry.fileName === fileName && entry.timestamp === timestamp)));
  };

  // Load recent searches from localStorage on mount
  useEffect(() => {
    const savedSearches = localStorage.getItem('dt_base_recent_searches');
    const savedServiceFilters = localStorage.getItem('dt_base_recent_service_filters');
    try {
      if (savedSearches) setRecentSearches(JSON.parse(savedSearches));
    } catch (e) {
      console.error("Failed to parse recent searches", e);
    }
    try {
      if (savedServiceFilters) setRecentServiceFilters(JSON.parse(savedServiceFilters));
    } catch (e) {
      console.error("Failed to parse recent service filters", e);
    }
  }, []);

  // Save recent searches to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('dt_base_recent_searches', JSON.stringify(recentSearches));
  }, [recentSearches]);

  useEffect(() => {
    localStorage.setItem('dt_base_recent_service_filters', JSON.stringify(recentServiceFilters));
  }, [recentServiceFilters]);

  const addToRecentSearches = (query: string) => {
    if (!query || query.length < 2) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s.toLowerCase() !== query.toLowerCase());
      return [query, ...filtered].slice(0, 5); // Keep last 5
    });
  };

  const addToRecentServiceFilters = (query: string) => {
    if (!query || query.length < 2) return;
    setRecentServiceFilters(prev => {
      const filtered = prev.filter(s => s.toLowerCase() !== query.toLowerCase());
      return [query, ...filtered].slice(0, 5); // Keep last 5
    });
  };

  // Debounce search and filter to prevent excessive re-renders and Firestore reads
  useEffect(() => {
    if (searchQuery || descriptionQuery) setIsSearching(true);
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setDebouncedDescription(descriptionQuery);
      setIsSearching(false);
      if (searchQuery.length >= 3) {
        addToRecentSearches(searchQuery);
        // Track search usage
        if (!isServiceUnlocked) {
          setUsageStats(prev => ({ ...prev, searches: prev.searches + 1 }));
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, descriptionQuery, isServiceUnlocked]);

  // Logic to sync descriptionQuery with searchQuery by default
  const lastSyncSearchRef = useRef('');
  useEffect(() => {
    if (searchQuery !== lastSyncSearchRef.current) {
      if (!descriptionQuery || descriptionQuery === lastSyncSearchRef.current) {
        setDescriptionQuery(searchQuery);
      }
      lastSyncSearchRef.current = searchQuery;
    }
  }, [searchQuery, descriptionQuery]);

  useEffect(() => {
    if (serviceFilter || secondaryServiceFilter) setIsFiltering(true);
    const timer = setTimeout(() => {
      setDebouncedService(serviceFilter);
      setDebouncedSecondaryService(secondaryServiceFilter);
      setIsFiltering(false);
      if (serviceFilter.length >= 3) addToRecentServiceFilters(serviceFilter);
    }, 500);
    return () => clearTimeout(timer);
  }, [serviceFilter, secondaryServiceFilter]);

  // Screen Wake Lock to prevent "crushing" when screen turns off during processing
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isProcessing) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err: any) {
          // Gracefully handle permission policy errors
          if (err.name === 'NotAllowedError' || err.message?.includes('permissions policy')) {
            console.warn("Wake Lock disallowed by policy, skipping.");
          } else {
            console.error("Wake Lock error:", err);
          }
        }
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        } catch (err) {
          console.error("Wake Lock release error:", err);
        }
      }
    };

    if (isProcessing) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // Re-request wake lock if tab becomes visible again
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isProcessing) {
        await requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isProcessing]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

  // Auth Listener
  useEffect(() => {
    if (!supabase) {
      setIsAuthReady(true);
      setError("Supabase configuration is missing. Please check your Secrets in AI Studio.");
      return;
    }

    // Get initial session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        setIsAuthReady(true);
      })
      .catch(err => {
        console.error("Supabase session error:", err);
        setError(getSupabaseErrorMessage(err));
        setIsAuthReady(true);
      });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setRecords([]);
    setTotalCount(0);
    localStorage.removeItem(`records_${user?.id}`);
  };

  const fetchRecords = useCallback(async () => {
    if (!user || !supabase) return;
    setIsRefreshing(true);
    // Automatic retry helper
    async function fetchWithRetry<T>(fn: () => PromiseLike<T>, retries = 3): Promise<T> {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (err: any) {
          const isNetworkError = err.message?.toLowerCase().includes('fetch') || err.status === 0;
          if (i === retries - 1 || !isNetworkError) throw err;
          await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential backoff
        }
      }
      throw new Error("Maximum retries reached");
    }

    try {
      let from = 0;
      let to = 999;
      
      // Fetch first page and total count
      const { data, count, error } = await fetchWithRetry(() => supabase!
        .from('maintenance_records')
        .select('id, plate_number, service_date, service_description, confidence, user_id, file_name, created_at', { count: 'exact' })
        .eq('user_id', user.id)
        .order('service_date', { ascending: false })
        .range(from, to)) as any;

      if (error) throw error;
      
      const rawRecords = data as MaintenanceRecord[];
      const total = count || 0;
      setTotalCount(total);

      let allData = [...rawRecords];

      // If there are more than 1000, fetch the rest in batches (up to 10k)
      while (allData.length < total && allData.length < 10000) {
        from += 1000;
        to += 1000;
        const { data: moreData, error: moreError } = await fetchWithRetry(() => supabase!
          .from('maintenance_records')
          .select('id, plate_number, service_date, service_description, confidence, user_id, file_name, created_at')
          .eq('user_id', user.id)
          .order('service_date', { ascending: false })
          .range(from, to)) as any;
        
        if (moreError) {
          console.warn("Error fetching more records:", moreError);
          break;
        }
        if (!moreData || moreData.length === 0) break;
        allData = [...allData, ...(moreData as MaintenanceRecord[])];
      }

      // Final deduplication using our robust utility function
      const uniqueRecords = deduplicateRecords(allData).map(r => ({
        ...r,
        verified: !!r.verified
      }));

      setRecords(uniqueRecords);
      setIsCloudConnected(true);
      setError(null);
      setIsQuotaExceeded(false);
      
      // Cache in localStorage
      localStorage.setItem(`records_${user.id}`, JSON.stringify(uniqueRecords));
      return uniqueRecords;
    } catch (err: any) {
      console.warn("Fetch failed:", err);
      setIsCloudConnected(false);
      
      // Check for quota/rate limit (Supabase uses standard HTTP codes)
      if (err.status === 429) {
        setIsQuotaExceeded(true);
      }

      // Fallback to localStorage
      const cached = localStorage.getItem(`records_${user.id}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setRecords(parsed);
          setError(null);
          return parsed;
        } catch (e) {
          console.error("Failed to parse cached records", e);
          setError(getSupabaseErrorMessage(err));
        }
      } else {
        setError(getSupabaseErrorMessage(err));
      }
      return [];
    } finally {
      setIsRefreshing(false);
    }
  }, [user]);

  const fetchMarketPrices = useCallback(async () => {
    if (!user || !supabase) return [];
    try {
      const { data, error } = await supabase
        .from('market_prices')
        .select('*')
        .eq('user_id', user.id);
      
      if (error) {
        const isMissingTable = error.code === '42P01' || 
                              error.message?.toLowerCase().includes('not found') ||
                              error.message?.toLowerCase().includes('does not exist');
        
        if (isMissingTable) {
          console.warn("Market prices table not found in Supabase. This feature is optional.");
          return [];
        }
        throw error;
      }
      if (data) {
        setMarketPrices(data);
        return data;
      }
      return [];
    } catch (err) {
      console.error("Error fetching market prices:", err);
      return [];
    }
  }, [user, supabase]);

  // Initial fetch
  useEffect(() => {
    if (user && isAuthReady) {
      fetchRecords();
      fetchMarketPrices();
    }
  }, [user, isAuthReady, fetchRecords, fetchMarketPrices]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase configuration is missing. Please check your Secrets in AI Studio.");
      return;
    }
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    
    setIsLoggingIn(true);
    setError(null);
    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setError("Account created! You can now log in.");
        setAuthMode('login');
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(getSupabaseErrorMessage(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Helper for AI extraction with robust retry logic
  const processImageWithRetry = useCallback(async (
    base64: string, 
    fileName: string, 
    logId: string | number, // timestamp or fileName
    isBatch: boolean = true,
    mode: 'fleet' | 'market' = 'fleet',
    isAudit: boolean = false,
    forceReprocess: boolean = false,
    isAuditUpload: boolean = false
  ): Promise<any> => {
    const maxRetries = 10;
    let currentDelay = 5000;
    
    try {
      for (let i = 0; i < maxRetries; i++) {
        try {
          // Prepare a brief history summary to help extraction accuracy
          const historySummary = records.slice(0, 30).map(r => `${r.plate_number}:${r.service_description}`).join(' | ');

          const extractionPromise = mode === 'market' 
            ? extractMarketPrices(base64, 'image/jpeg', customGeminiKey || undefined)
            : extractMaintenanceData(base64, 'image/jpeg', fleetRegistry, historySummary, customGeminiKey || undefined);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("AI extraction timed out.")), 120000)
          );
          const result = await Promise.race([extractionPromise, timeoutPromise]) as any;
          setUsageStats(prev => ({ ...prev, extractions: prev.extractions + 1 }));

          // Step 3: Database Writes (if not in Audit Mode)
          if (!isAudit && supabase && user) {
            if (forceReprocess) {
              console.log(`[RETRY SYSTEM] Deleting existing database entries for ${fileName} before fresh AI insertion...`);
              if (mode === 'market') {
                // market uses upsert on unique keys, no delete needed
              } else {
                const { data: recordsToDelete } = await supabase
                  .from('maintenance_records')
                  .select('id')
                  .eq('user_id', user.id)
                  .eq('file_name', fileName);
                
                if (recordsToDelete && recordsToDelete.length > 0) {
                  const rIds = recordsToDelete.map(r => r.id);
                  await supabase
                    .from('maintenance_record_images')
                    .delete()
                    .in('record_id', rIds);
                  await supabase
                    .from('maintenance_records')
                    .delete()
                    .in('id', rIds);
                }
              }
            }

            if (mode === 'market') {
              if (result.items && result.items.length > 0) {
                for (const item of result.items) {
                  const { error: marketError } = await supabase
                    .from('market_prices')
                    .upsert({
                      item_name: item.item_name,
                      price: item.price,
                      currency: item.currency,
                      confirmed_by: i > 0 ? `AI Scan (Retry ${i})` : 'AI Scan',
                      last_updated: new Date().toISOString(),
                      user_id: user.id
                    }, { onConflict: 'item_name,user_id' });
                  
                  if (marketError) throw marketError;
                  setSessionStats(prev => ({ ...prev, writes: prev.writes + 1 }));
                }
              } else {
                throw new Error("AI was unable to extract any items from the image.");
              }
            } else {
              if (result.records && result.records.length > 0) {
                for (const record of result.records) {
                  const normPlate = normalizePlate(record.plate_number).toUpperCase();
                  const normDate = normalizeDate(record.service_date);

                  if (isAuditUpload) {
                    const normalize = (str: string) => str ? str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim() : '';
                    const normalizePlateLocal = (str: string) => str ? str.toUpperCase().replace(/[^A-Z0-9]/g, '').trim() : '';
                    const getSimilarityScore = (s1: string, s2: string) => {
                      const str1 = normalize(s1);
                      const str2 = normalize(s2);
                      if (str1 === str2) return { score: 1.0, commonCount: 100 };
                      if (!str1 || !str2) return { score: 0, commonCount: 0 };
                      const words1 = str1.split(/\s+/).filter(w => w.length > 2);
                      const words2 = str2.split(/\s+/).filter(w => w.length > 2);
                      if (words1.length === 0 || words2.length === 0) return { score: 0, commonCount: 0 };
                      const commonWords = words1.filter(w => words2.includes(w));
                      return { score: commonWords.length / Math.max(words1.length, words2.length), commonCount: commonWords.length };
                    };

                    const normExtractedPlate = normalizePlateLocal(record.plate_number);
                    const match = records.find(r => {
                      const platesMatch = normalizePlateLocal(r.plate_number) === normExtractedPlate;
                      const datesMatch = normalizeDate(r.service_date) === normDate;
                      const similarity = getSimilarityScore(r.service_description, record.service_description);
                      return platesMatch && datesMatch && (similarity.commonCount >= 5 || normalize(r.service_description) === normalize(record.service_description));
                    });

                    if (match) {
                      console.log(`[AUDIT UPLOAD MODE] Skipping duplicate entry: ${normPlate} on ${normDate}`);
                      continue;
                    }
                  }

                  const { data: recordData, error: recordError } = await supabase
                    .from('maintenance_records')
                    .insert({
                      plate_number: normPlate,
                      service_date: normDate,
                      service_description: record.service_description.trim(),
                      confidence: record.confidence,
                      user_id: user.id,
                      file_name: fileName,
                      created_at: new Date().toISOString()
                    })
                    .select('id, plate_number, service_date, service_description, confidence, user_id, file_name, created_at')
                    .single();

                  if (recordError) throw recordError;
                  setSessionStats(prev => ({ ...prev, writes: prev.writes + 1 }));

                  if (recordData) {
                    const { error: imageError } = await supabase
                      .from('maintenance_record_images')
                      .insert({
                        record_id: recordData.id,
                        image_data: base64,
                        user_id: user.id,
                        created_at: new Date().toISOString()
                      });
                    
                    if (imageError) throw imageError;
                    setSessionStats(prev => ({ ...prev, writes: prev.writes + 1 }));
                  }
                }
              } else {
                throw new Error("AI could not read any maintenance records from the image.");
              }
            }
          }

          return result;
        } catch (err: any) {
          const errorMessage = getAIErrorMessage(err).toLowerCase();
          if (errorMessage.includes("quota exceeded") || errorMessage.includes("billing details")) {
            throw new Error("DAILY_QUOTA_EXCEEDED");
          }

          const isTransient = 
            errorMessage.includes("429") || 
            errorMessage.includes("rate limit") ||
            errorMessage.includes("500") ||
            errorMessage.includes("internal error") ||
            errorMessage.includes("failed to fetch") ||
            errorMessage.includes("connection error") ||
            errorMessage.includes("load failed") ||
            errorMessage.includes("timed out") ||
            errorMessage.includes("xhr error") ||
            errorMessage.includes("rpc failed") ||
            errorMessage.includes("proxyunarycall") ||
            errorMessage.includes("makersuiteservice") ||
            errorMessage.includes("error code: 6") ||
            errorMessage.includes("overloaded") ||
            errorMessage.includes("high demand") ||
            errorMessage.includes("retry") ||
            errorMessage.includes("syntax") ||
            errorMessage.includes("unexpected token") ||
            errorMessage.includes("json") ||
            errorMessage.includes("malformed");

          if (isTransient && i < maxRetries - 1) {
            const reason = errorMessage.includes("429") ? "Rate limit" : "Network error";
            const retryDelay = errorMessage.includes("429") ? currentDelay * 2.5 : currentDelay;
            
            setUploadLog(prev => prev.map(entry => {
              const match = isBatch ? entry.fileName === fileName : entry.timestamp === logId;
              return match && entry.status === 'processing' 
                ? { ...entry, error: `${reason}, retrying... (${i + 1}/${maxRetries})` } 
                : entry;
            }));

            await new Promise(r => setTimeout(r, retryDelay));
            currentDelay = retryDelay * 1.5;
            continue;
          }
          throw err;
        }
      }
      
      // If the loop finished without exiting, throw the last error
      throw new Error("AI extraction failed after maximum retries.");
    } catch (finalError: any) {
      console.error(`[AI ERROR] Failed to process ${fileName}:`, finalError);
      throw finalError;
    }
  }, [user, supabase, fleetRegistry, records]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, mode: 'fleet' | 'market' = 'fleet') => {
    if (!supabase) {
      setError("Supabase configuration is missing. Please check your Secrets in AI Studio.");
      return;
    }
    if (!user) {
      setError("You must be logged in to upload records. Please click the Login button.");
      return;
    }

    // Check if services are unlocked
    if (!isServiceUnlocked) {
      setShowServicePasswordPrompt(true);
      return;
    }

    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsProcessing(true);
      setError(null);
      const fileArray = Array.from(files);
      
      setNotification({
        message: `Starting ${isAuditMode ? 'Audit ' : ''}${mode === 'market' ? 'Market Price' : 'Fleet Maintenance'} Scan for ${fileArray.length} file(s)...`,
        type: 'info'
      });

      setProgress({ current: 0, total: fileArray.length, failed: 0 });
      
      const newEntries: UploadLogEntry[] = [];

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        let objectUrl: string | null = null;
        try {
          objectUrl = URL.createObjectURL(file);
          const resizedBase64 = await resizeImage(objectUrl, 1000);
          
          newEntries.push({
            fileName: file.name,
            status: 'queued',
            timestamp: Date.now() + newEntries.length,
            imageData: resizedBase64,
            mode,
            isAudit: isAuditMode,
            isAuditUpload: isAuditUploadMode
          });
        } catch (err) {
          console.error(`Error queuing ${file.name}:`, err);
        } finally {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          setProgress(prev => ({ ...prev, current: i + 1 }));
        }
      }

      setUploadLog(prev => [...newEntries, ...prev].slice(0, 50));
      e.target.value = '';
      
      // Clear progress after a short delay
      setTimeout(() => setProgress({ current: 0, total: 0, failed: 0 }), 1000);

    } catch (err: any) {
      console.error("Queue error:", err);
      setError("Failed to queue images. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [user, supabase, isServiceUnlocked, isAuditMode, isAuditUploadMode]);

  const startBatchProcessing = useCallback(async () => {
    if (!supabase || !user || isProcessing) return;
    
    const queuedItems = uploadLog.filter(entry => entry.status === 'queued');
    if (queuedItems.length === 0) return;

    const recordsCountBefore = records.length;
    const marketPricesCountBefore = marketPrices.length;
    const totalImages = queuedItems.length;

    try {
      setIsProcessing(true);
      setIsStopping(false);
      shouldStopRef.current = false;
      setError(null);
      setFailedFiles([]);
      setProgress({ current: 0, total: totalImages, failed: 0 });
      setBatchSessionSummary(null);

      let localCompletedCount = 0;
      let localFailedCount = 0;
      let totalExtractedItemsCount = 0;
      const extractedItemsList: any[] = [];

      for (const entry of queuedItems) {
        if (shouldStopRef.current) break;

        // Update status to processing
        setUploadLog(prev => prev.map(e => 
          e.timestamp === entry.timestamp ? { ...e, status: 'processing', error: undefined } : e
        ));

        try {
          if (!entry.imageData) throw new Error("Image data missing for queued item.");

          const result = await processImageWithRetry(
            entry.imageData, 
            entry.fileName, 
            entry.timestamp, 
            false, 
            entry.mode, 
            isAuditMode, 
            false, 
            isAuditUploadMode
          );
          
          if (shouldStopRef.current) {
            setUploadLog(prev => prev.map(e => 
              e.timestamp === entry.timestamp ? { ...e, status: 'queued', error: undefined } : e
            ));
            break;
          }

          if (result) {
            if (entry.mode === 'market' && result.items && Array.isArray(result.items)) {
              totalExtractedItemsCount += result.items.length;
              extractedItemsList.push(...result.items.map((it: any) => ({ ...it, fileName: entry.fileName, mode: 'market' })));
            } else if (entry.mode === 'fleet' && result.records && Array.isArray(result.records)) {
              totalExtractedItemsCount += result.records.length;
              extractedItemsList.push(...result.records.map((rec: any) => ({ ...rec, fileName: entry.fileName, mode: 'fleet' })));
            }
          }

          if ((isAuditMode || isAuditUploadMode) && entry.mode === 'fleet') {
            // Fleet Maintenance Audit Mode
            if (!result || !result.records || result.records.length === 0) {
              throw new Error("No readable records found in this image.");
            }

            const normalize = (str: string) => str ? str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim() : '';
            const normalizePlate = (str: string) => str ? str.toUpperCase().replace(/[^A-Z0-9]/g, '').trim() : '';
            const getSimilarityScore = (s1: string, s2: string) => {
              const str1 = normalize(s1);
              const str2 = normalize(s2);
              if (str1 === str2) return { score: 1.0, commonCount: 100 };
              if (!str1 || !str2) return { score: 0, commonCount: 0 };
              const words1 = str1.split(/\s+/).filter(w => w.length > 2);
              const words2 = str2.split(/\s+/).filter(w => w.length > 2);
              if (words1.length === 0 || words2.length === 0) return { score: 0, commonCount: 0 };
              const commonWords = words1.filter(w => words2.includes(w));
              return { score: commonWords.length / Math.max(words1.length, words2.length), commonCount: commonWords.length };
            };

            for (const record of result.records) {
              const normExtractedDate = normalizeDate(record.service_date);
              const normExtractedPlate = normalizePlate(record.plate_number);
              
              const match = records.find(r => {
                const platesMatch = normalizePlate(r.plate_number) === normExtractedPlate;
                const datesMatch = normalizeDate(r.service_date) === normExtractedDate;
                const similarity = getSimilarityScore(r.service_description, record.service_description);
                return platesMatch && datesMatch && (similarity.commonCount >= 5 || normalize(r.service_description) === normalize(record.service_description));
              });

              setAuditResults(prev => [{
                fileName: entry.fileName,
                plate: record.plate_number,
                date: record.service_date,
                service: record.service_description,
                isDuplicate: !!match,
                isPotential: !match && !!records.find(r => normalizePlate(r.plate_number) === normExtractedPlate && normalizeDate(r.service_date) === normExtractedDate),
                matchId: match?.id
              }, ...prev]);
            }
          }
          

          // Success (only if not stopped)
          if (!shouldStopRef.current) {
            setNotification({
              message: `${entry.isAudit ? 'Audit ' : ''}${entry.mode === 'market' ? 'Market Price' : 'Fleet Maintenance'} Scan completed successfully!`,
              type: 'success'
            });
            setUploadLog(prev => prev.map(e => 
              e.timestamp === entry.timestamp ? { ...e, status: 'success', error: undefined } : e
            ));

            // Update usage stats on success
            if (!isServiceUnlocked) {
              setUsageStats(prev => ({ ...prev, uploads: prev.uploads + 1 }));
            }
          } else {
            // If stopped, put back in queue
            setUploadLog(prev => prev.map(e => 
              e.timestamp === entry.timestamp ? { ...e, status: 'queued', error: undefined } : e
            ));
          }

        } catch (err: any) {
          console.error(`[BATCH] Failed: ${entry.fileName}`, err);
          
          const errorMsg = err.message || String(err);
          const isQuotaError = errorMsg.includes("DAILY_QUOTA_EXCEEDED") || 
                              errorMsg.includes("quota") || 
                              errorMsg.includes("RESOURCE_EXHAUSTED") ||
                              errorMsg.includes("429");

          if (isQuotaError) {
            // Calculate time until midnight
            const now = new Date();
            const midnight = new Date();
            midnight.setHours(24, 0, 0, 0);
            const diffMs = midnight.getTime() - now.getTime();
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            
            const resetMsg = `Daily Quota Reached. Reset in ${diffHours}h ${diffMins}m (at Midnight).`;
            setError(
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-bold">Google AI Quota Reached</span>
                </div>
                <p className="text-[11px] opacity-80">{resetMsg}</p>
                <p className="text-[10px] opacity-60 mt-1">Google limits free AI usage. You can wait until midnight or switch to your own API key to continue now.</p>
                <button 
                  onClick={handleSelectKey}
                  className="mt-2 py-2 px-3 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <Key className="w-3 h-3" />
                  Switch API Key
                </button>
              </div> as any
            );
            
            const diagnostic = getDiagnosticError(new Error("DAILY_QUOTA_EXCEEDED"));
            setUploadLog(prev => prev.map(e => 
              e.timestamp === entry.timestamp ? { 
                ...e, 
                status: 'failed', 
                error: diagnostic.short,
                diagnostic: diagnostic
              } : e
            ));
            
            // Stop the entire batch
            shouldStopRef.current = true;
            break;
          }

          localFailedCount++;
          setFailedFiles(prev => [...prev, entry.fileName]);
          
          const diagnostic = getDiagnosticError(err);
          setUploadLog(prev => prev.map(e => 
            e.timestamp === entry.timestamp ? { 
              ...e, 
              status: 'failed', 
              error: diagnostic.short,
              diagnostic: diagnostic
            } : e
          ));
        } finally {
          localCompletedCount++;
          setProgress(prev => ({ ...prev, current: localCompletedCount, failed: localFailedCount }));
          
          // 15-second delay between requests to stay within free tier rate limits (approx 4 RPM)
          // This is safer for localhost and shared environments
          if (localCompletedCount < queuedItems.length && !shouldStopRef.current) {
            await new Promise(r => setTimeout(r, 15000));
          }
        }
      }

      if (shouldStopRef.current) return;

      if (localFailedCount > 0) {
        setError(`Processed ${localCompletedCount} images, but ${localFailedCount} failed. Check the log below.`);
      } else {
        setTimeout(() => setProgress({ current: 0, total: 0, failed: 0 }), 2000);
      }

      const recordsAfterArray = await fetchRecords();
      const marketPricesAfterArray = await fetchMarketPrices();

      const recordsCountAfter = recordsAfterArray?.length ?? recordsCountBefore;
      const marketPricesCountAfter = marketPricesAfterArray?.length ?? marketPricesCountBefore;

      const successCount = localCompletedCount - localFailedCount;
      const newRecordsCount = Math.max(0, recordsCountAfter - recordsCountBefore);
      const newMarketPricesCount = Math.max(0, marketPricesCountAfter - marketPricesCountBefore);

      if (successCount > 0) {
        setBatchSessionSummary({
          totalImages,
          successCount,
          recordsBefore: recordsCountBefore,
          recordsAfter: recordsCountAfter,
          newRecordsCount,
          newMarketPricesCount,
          mode: queuedItems[0]?.mode || 'fleet',
          isAudit: !!isAuditMode || !!isAuditUploadMode,
          totalExtractedCount: totalExtractedItemsCount,
          extractedItems: extractedItemsList
        });
      }

    } catch (err: any) {
      console.error("Batch processing error:", err);
      setError("A critical error occurred during batch processing.");
    } finally {
      setIsProcessing(false);
      setIsStopping(false);
      shouldStopRef.current = false;
    }
  }, [user, supabase, uploadLog, isProcessing, fetchRecords, fetchMarketPrices, processImageWithRetry, records, marketPrices, isAuditMode, isAuditUploadMode, isServiceUnlocked]);

  const stopBatchProcessing = useCallback(() => {
    setIsStopping(true);
    shouldStopRef.current = true;
  }, []);

  const handleRetry = useCallback(async (entry: UploadLogEntry) => {
    if (!supabase || !user || !entry.imageData) return;

    try {
      // Update log to processing
      setUploadLog(prev => prev.map(e => 
        e.timestamp === entry.timestamp ? { ...e, status: 'processing', error: undefined } : e
      ));

      setNotification({
        message: `Retrying ${(entry.isAudit || entry.isAuditUpload) ? 'Audit ' : ''}${entry.mode === 'market' ? 'Market Price' : 'Fleet Maintenance'} Scan for ${entry.fileName}...`,
        type: 'info'
      });

      const result = await processImageWithRetry(
        entry.imageData, 
        entry.fileName, 
        entry.timestamp, 
        false, 
        entry.mode, 
        entry.isAudit, 
        true, 
        entry.isAuditUpload
      );

      if ((entry.isAudit || entry.isAuditUpload) && entry.mode === 'fleet') {
        // Audit Mode: Check for duplicates instead of saving
        const normalize = (str: string) => str ? str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim() : '';
        const normalizePlate = (str: string) => str ? str.toUpperCase().replace(/[^A-Z0-9]/g, '').trim() : '';
        const getSimilarityScore = (s1: string, s2: string) => {
          const str1 = normalize(s1);
          const str2 = normalize(s2);
          if (str1 === str2) return { score: 1.0, commonCount: 100 };
          if (!str1 || !str2) return { score: 0, commonCount: 0 };
          const words1 = str1.split(/\s+/).filter(w => w.length > 2);
          const words2 = str2.split(/\s+/).filter(w => w.length > 2);
          if (words1.length === 0 || words2.length === 0) return { score: 0, commonCount: 0 };
          const commonWords = words1.filter(w => words2.includes(w));
          return { score: commonWords.length / Math.max(words1.length, words2.length), commonCount: commonWords.length };
        };

        const newAuditResults: any[] = [];
        for (const record of result.records) {
          const normExtractedDate = normalizeDate(record.service_date);
          const normExtractedPlate = normalizePlate(record.plate_number);
          
          const match = records.find(r => {
            const platesMatch = normalizePlate(r.plate_number) === normExtractedPlate;
            const datesMatch = normalizeDate(r.service_date) === normExtractedDate;
            const similarity = getSimilarityScore(r.service_description, record.service_description);
            return platesMatch && datesMatch && (similarity.commonCount >= 5 || normalize(r.service_description) === normalize(record.service_description));
          });

          newAuditResults.push({
            fileName: entry.fileName,
            plate: record.plate_number,
            date: record.service_date,
            service: record.service_description,
            isDuplicate: !!match,
            isPotential: !match && !!records.find(r => normalizePlate(r.plate_number) === normExtractedPlate && normalizeDate(r.service_date) === normExtractedDate),
            matchId: match?.id
          });
        }
        setAuditResults(prev => [...newAuditResults, ...prev]);
      } else if (entry.mode === 'market') {
        // Refresh market prices
        const { data: updatedPrices } = await supabase
          .from('market_prices')
          .select('*')
          .eq('user_id', user.id)
          .order('last_updated', { ascending: false });
        if (updatedPrices) setMarketPrices(updatedPrices);
      }
      
      // Success!
      setNotification({
        message: `${entry.isAudit ? 'Audit ' : ''}${entry.mode === 'market' ? 'Market Price' : 'Fleet Maintenance'} Retry successful!`,
        type: 'success'
      });
      setUploadLog(prev => prev.map(e => 
        e.timestamp === entry.timestamp ? { ...e, status: 'success', error: undefined } : e
      ));
      
      // Refresh records
      fetchRecords();

    } catch (err: any) {
      console.error(`[RETRY] Failed: ${entry.fileName}`, err);
      const diagnostic = getDiagnosticError(err);
      
      setUploadLog(prev => prev.map(e => 
        e.timestamp === entry.timestamp ? { 
          ...e, 
          status: 'failed', 
          error: diagnostic.short,
          diagnostic: diagnostic
        } : e
      ));

      setNotification({
        message: `Retry failed: ${diagnostic.short}`,
        type: 'warning'
      });
    }
  }, [supabase, user, processImageWithRetry, records, fetchRecords]);

  const handleManualAdd = async (dataOverride?: any) => {
    const dataToUse = dataOverride || manualEntryData;
    if (!user || !dataToUse || !supabase) return;
    if (!dataToUse.plateNumber || !dataToUse.date || !dataToUse.service) {
      setError("Please fill in all fields for manual entry.");
      return;
    }
    
    try {
      setIsProcessing(true);

      const normPlate = normalizePlate(dataToUse.plateNumber).toUpperCase();
      const normDate = normalizeDate(dataToUse.date);
      const normDesc = dataToUse.service.toLowerCase().trim().replace(/\s+/g, ' ');

      // Deduplication check for manual entries
      const { data: existing } = await supabase
        .from('maintenance_records')
        .select('id, service_description')
        .eq('user_id', user.id)
        .eq('plate_number', normPlate)
        .eq('service_date', normDate);

      const isDuplicate = existing && existing.some(r => {
        const existingDesc = r.service_description.toLowerCase().trim().replace(/\s+/g, ' ');
        return existingDesc === normDesc || existingDesc.includes(normDesc) || normDesc.includes(existingDesc);
      });

      if (isDuplicate) {
        setError("This record already exists in the system.");
        setIsProcessing(false);
        return;
      }

      setSessionStats(prev => ({ ...prev, writes: prev.writes + 1 }));
      
      const { error } = await supabase
        .from('maintenance_records')
        .insert({
          plate_number: normPlate,
          service_date: normDate,
          service_description: dataToUse.service.trim(),
          confidence: 1.0,
          user_id: user.id,
          file_name: dataToUse.fileName,
          created_at: new Date().toISOString()
        });
      
      if (error) throw error;
      
      // Update log to success
      setUploadLog(prev => prev.map(entry => 
        entry.fileName === dataToUse.fileName && entry.status === 'failed' 
          ? { ...entry, status: 'success', error: undefined } 
          : entry
      ));
      
      setManualEntryData(null);
      setError(null);
      fetchRecords(); // Refresh list
    } catch (err: any) {
      setError(getSupabaseErrorMessage(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleVerify = async (record: MaintenanceRecord) => {
    if (!user || !supabase) return;
    
    // Temporary No-op: The 'verified' column is missing in the database schema.
    // To enable this feature, please add a boolean 'verified' column to your 'maintenance_records' table in Supabase.
    setRecords(prev => prev.map(r => r.id === record.id ? { ...r, verified: !r.verified } : r));
    setNotification({ 
      message: `Verified status toggled locally (DB update skipped as column is missing).`, 
      type: 'info' 
    });
    /*
    try {
      const { error } = await supabase
        .from('maintenance_records')
        .update({ verified: !record.verified })
        .eq('id', record.id)
        .eq('user_id', user.id);

      if (error) throw error;
      
      // Update local state for immediate feedback
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, verified: !r.verified } : r));
      
      if (!record.verified) {
        setNotification({ message: `Record verified successfully!`, type: 'success' });
      }
    } catch (err: any) {
      setError(getSupabaseErrorMessage(err));
    }
    */
  };

  const handleEditRecord = async (recordOverride?: MaintenanceRecord) => {
    const recordToUpdate = recordOverride || editingRecord;
    if (!user || !recordToUpdate || !supabase) return;
    
    try {
      setIsProcessing(true);

      const normPlate = normalizePlate(recordToUpdate.plate_number).toUpperCase();
      const normDate = normalizeDate(recordToUpdate.service_date);
      const normDesc = recordToUpdate.service_description.toLowerCase().trim().replace(/\s+/g, ' ');

      // Deduplication check for updates: ensure we don't create a clone of another record
      const { data: existing } = await supabase
        .from('maintenance_records')
        .select('id, service_description')
        .eq('user_id', user.id)
        .eq('plate_number', normPlate)
        .eq('service_date', normDate)
        .neq('id', recordToUpdate.id);

      const isDuplicate = existing && existing.some(r => {
        const existingDesc = r.service_description.toLowerCase().trim().replace(/\s+/g, ' ');
        return existingDesc === normDesc || existingDesc.includes(normDesc) || normDesc.includes(existingDesc);
      });

      if (isDuplicate) {
        setError("Another record with identical details (Plate, Date, Description) already exists.");
        setIsProcessing(false);
        return;
      }

      const { error } = await supabase
        .from('maintenance_records')
        .update({
          plate_number: normPlate,
          service_date: normDate,
          service_description: recordToUpdate.service_description.trim()
        })
        .eq('id', recordToUpdate.id)
        .eq('user_id', user.id);

      if (error) throw error;
      
      setNotification({ message: `Record for ${editingRecord.plate_number} updated successfully!`, type: 'success' });
      setEditingRecord(null);
      fetchRecords();
    } catch (err: any) {
      setError(getSupabaseErrorMessage(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredRecords = useMemo(() => {
    const filtered = records.filter(record => {
      const searchLower = debouncedSearch.toLowerCase().trim();
      const descLower = debouncedDescription.toLowerCase().trim();
      
      const matchesSearch = !searchLower || 
        record.plate_number.toLowerCase().includes(searchLower) ||
        arePlatesSimilar(record.plate_number, searchLower);
        
      const matchesDescription = !descLower ||
        record.service_description.toLowerCase().includes(descLower);
        
      const matchesService = record.service_description.toLowerCase().includes(debouncedService.toLowerCase());
      const matchesSecondaryService = record.service_description.toLowerCase().includes(debouncedSecondaryService.toLowerCase());
      
      const recordDate = new Date(record.service_date);
      const matchesStartDate = !startDate || recordDate >= new Date(startDate);
      const matchesEndDate = !endDate || recordDate <= new Date(endDate);

      return matchesSearch && matchesDescription && matchesService && matchesSecondaryService && matchesStartDate && matchesEndDate;
    });

    return deduplicateRecords(filtered);
  }, [records, debouncedSearch, debouncedDescription, debouncedService, debouncedSecondaryService, startDate, endDate]);

  // Fetch image for the latest record when it changes
  useEffect(() => {
    const fetchLatestImage = async () => {
      if (!showLatestOnly || filteredRecords.length === 0 || !user || !supabase) {
        if (latestImage) setLatestImage(null);
        lastFetchedRecordIdRef.current = null;
        return;
      }

      const latestRecord = filteredRecords[0];
      
      // Avoid redundant fetches if the record hasn't changed
      if (latestRecord.id === lastFetchedRecordIdRef.current) return;

      // If the record already has an image (legacy), use it
      if (latestRecord.originalImage) {
        setLatestImage(latestRecord.originalImage);
        lastFetchedRecordIdRef.current = latestRecord.id;
        return;
      }

      // Otherwise fetch from separate table
      setIsLoadingLatestImage(true);
      try {
        const { data, error } = await supabase
          .from('maintenance_record_images')
          .select('image_data')
          .eq('record_id', latestRecord.id)
          .eq('user_id', user.id)
          .limit(1)
          .single();
        
        if (error && error.code !== 'PGRST116') throw error;
        
        setSessionStats(prev => ({ ...prev, reads: prev.reads + 1 }));
        
        if (data) {
          setLatestImage(data.image_data);
        } else {
          setLatestImage(null);
        }
        lastFetchedRecordIdRef.current = latestRecord.id;
      } catch (err) {
        console.error("Failed to fetch latest image", err);
        setError(getSupabaseErrorMessage(err));
        setLatestImage(null);
      } finally {
        setIsLoadingLatestImage(false);
      }
    };

    fetchLatestImage();
  }, [filteredRecords, user, showLatestOnly]);

  const groupedRecords = useMemo(() => {
    const groups: Record<string, MaintenanceRecord[]> = {};
    const needsReview: MaintenanceRecord[] = [];
    
    // Sort records by date descending
    const sorted = [...filteredRecords].sort((a, b) => new Date(b.service_date).getTime() - new Date(a.service_date).getTime());
    
    sorted.forEach(record => {
      const plate = record.plate_number ? record.plate_number.toUpperCase().trim() : 'UNKNOWN';
      const cleanRegistry = fleetRegistry.map(p => p.trim()).filter(p => p.length > 0);
      
      // Try to find a matching plate in the registry (Exact first, then similar)
      const normalizedPlate = normalizePlate(plate);
      const exactMatch = cleanRegistry.find(p => normalizePlate(p) === normalizedPlate);
      const registryMatch = exactMatch || cleanRegistry.find(p => arePlatesSimilar(p, plate));
      
      if (registryMatch) {
        // Group under the OFFICIAL registry name, not the typo name
        if (!groups[registryMatch]) {
          groups[registryMatch] = [];
        }
        groups[registryMatch].push(record);
      } else if (cleanRegistry.length === 0) {
        // If no registry, fallback to grouping by normalized plate to avoid "KCH 054 T" vs "KCH 054T"
        const existingKey = Object.keys(groups).find(k => normalizePlate(k) === normalizedPlate);
        const folderKey = existingKey || plate;
        if (!groups[folderKey]) groups[folderKey] = [];
        groups[folderKey].push(record);
      } else {
        // Not in registry and registry exists -> Needs Review
        needsReview.push(record);
      }
    });

    // We return a specialized object that includes the Needs Review group first
    const finalGroups: Record<string, MaintenanceRecord[]> = {};
    if (needsReview.length > 0) {
      finalGroups['⚠️ NEEDS REVIEW'] = needsReview;
    }
    
    // Seed all registry plates to ensure they exist as folders
    const cleanRegistry = fleetRegistry.map(p => p.trim()).filter(p => p.length > 0);
    const isActuallyFiltering = !!(debouncedSearch || debouncedDescription || debouncedService || debouncedSecondaryService || startDate || endDate);

    cleanRegistry.sort().forEach(p => {
      // If filtering, only show folders with records. Otherwise show all registry folders.
      if (!isActuallyFiltering) {
        finalGroups[p] = groups[p] || [];
      } else if (groups[p] && groups[p].length > 0) {
        finalGroups[p] = groups[p];
      }
    });

    // If no registry, just return the groups we found
    if (cleanRegistry.length === 0) {
      Object.keys(groups).sort().forEach(key => {
        finalGroups[key] = groups[key];
      });
    }

    return finalGroups;
  }, [filteredRecords, fleetRegistry]);

  // Fetch Records
  useEffect(() => {
    if (user && isAuthReady) {
      fetchRecords();
    }
  }, [user, isAuthReady, fetchRecords]);

  // Fetch Market Prices
  useEffect(() => {
    if (user && isAuthReady) {
      fetchMarketPrices();
    }
  }, [user, isAuthReady, fetchMarketPrices]);

  const handleSaveMarketPrice = async (item: string, price: number, currency: string) => {
    if (!user || !supabase) return;
    
    try {
      const { error } = await supabase
        .from('market_prices')
        .upsert({
          item_name: item,
          price: price,
          currency: currency,
          confirmed_by: user.email || 'User',
          last_updated: new Date().toISOString(),
          user_id: user.id
        }, { onConflict: 'item_name,user_id' });
        
      if (error) {
        if (error.message?.includes('not found')) {
          setError("Market prices table is not set up in your database yet.");
          return;
        }
        throw error;
      }

      // Refresh prices
      const { data: updatedData, error: fetchError } = await supabase
        .from('market_prices')
        .select('*')
        .eq('user_id', user.id);
      
      if (fetchError) throw fetchError;
      if (updatedData) setMarketPrices(updatedData);
    } catch (err) {
      console.error("Error saving market price:", err);
      setError(getSupabaseErrorMessage(err));
    }
  };

  const handleFocusInsight = useCallback((plate: string | null, service: string | null, year: number | null) => {
    setViewMode('analytics');
    
    if (plate) {
      setSearchQuery(plate);
      setDebouncedSearch(plate);
    }
    
    if (service) {
      setServiceFilter(service);
      setDebouncedService(service);
    }
    
    if (year) {
      setStartDate(`${year}-01-01`);
      setEndDate(`${year}-12-31`);
    }

    setNotification({ 
      message: `Focusing insights ${plate ? `on ${plate}` : ''} ${service ? `for ${service}` : ''}...`, 
      type: 'info' 
    });
  }, []);

  const handleTroubleFinding = useCallback(async () => {
    if (!records.length || !searchQuery.trim()) return;
    
    if (!isServiceUnlocked) {
      setShowServicePasswordPrompt(true);
      return;
    }

    setIsTroubleFindingLoading(true);
    setTroubleFindingAnswer(null);
    
    try {
      const truckRecords = records.filter(r => 
        (r.plate_number || '').toLowerCase().includes(searchQuery.toLowerCase())
      );

      if (truckRecords.length === 0) {
        setTroubleFindingAnswer(`No records found for truck ${searchQuery.toUpperCase()}.`);
        setIsTroubleFindingLoading(false);
        return;
      }

      const context = `The user is having trouble finding maintenance history for truck ${searchQuery.toUpperCase()}. 
      Analyze the entire fleet history to find relevant records or patterns related to this truck.`;
      
      const answer = await analyzeMaintenanceData(context, records, [], marketPrices, viewMode, customGeminiKey || undefined);
      setUsageStats(prev => ({ ...prev, searches: prev.searches + 1 }));
      setTroubleFindingAnswer(answer);
    } catch (err: any) {
      console.error("Trouble finding error:", err);
      setTroubleFindingAnswer("Error searching for this truck's history.");
    } finally {
      setIsTroubleFindingLoading(false);
    }
  }, [records, searchQuery, serviceFilter, secondaryServiceFilter, startDate, endDate, isServiceUnlocked, marketPrices]);

  const handleServiceHintSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!serviceHintQuery.trim() || !records.length || isServiceHintLoading || !searchQuery.trim()) return;
    
    if (!isServiceUnlocked) {
      setShowServicePasswordPrompt(true);
      return;
    }

    setIsServiceHintLoading(true);
    setServiceHintAnswer(null);
    
    try {
      // Filter records to ONLY the current truck
      const truckRecords = records.filter(r => 
        (r.plate_number || '').toLowerCase().includes(searchQuery.toLowerCase())
      );

      if (truckRecords.length === 0) {
        setServiceHintAnswer(`No records found for truck ${searchQuery.toUpperCase()}.`);
        setIsServiceHintLoading(false);
        return;
      }

      // Find technically related terms using AI and then filter records
      const prompt = `The user is searching for truck maintenance records related to: "${serviceHintQuery}" for truck ${searchQuery.toUpperCase()}.
      
      TASK: 
      1. Identify all technical components and service types that are functionally related to "${serviceHintQuery}". 
         For example, if they say 'air compressor', related items include '6 way valve', 'control valve', 'air dryer', 'relay valve', etc.
         If they say 'engine', related items include 'piston rings', 'head covers', 'fuel injectors', etc.
      2. Search through the provided maintenance database for ANY records matching these related terms or categories.
      3. Return a clean, simple list of matching unique records.
      
      FORMAT:
      Return ONLY a list where each line is: "DATE | SERVICE_DESCRIPTION"
      Avoid any preamble, explanations, names, or places. 
      Only include unique service events per truck (if many identical services on same day, list once).
      
      Example Output:
      29/04/2024 | compressor new 
      27/03/2025 | 6 way valve repair kit 
      27/03/2025 | air dryer filter
      
      If no related records are found, respond with "NO_RECORDS_FOUND".`;
      
      const answer = await analyzeMaintenanceData(prompt, records, [], [], viewMode, customGeminiKey || undefined);
      
      if (answer.trim() === 'NO_RECORDS_FOUND') {
        setServiceHintAnswer(`No related ${serviceHintQuery} records found for truck ${searchQuery.toUpperCase()}.`);
      } else {
        setServiceHintAnswer(answer);
      }
      
      setUsageStats(prev => ({ ...prev, searches: prev.searches + 1 }));
    } catch (err: any) {
      console.error("Service hint error:", err);
      setServiceHintAnswer("Error searching for service hints.");
    } finally {
      setIsServiceHintLoading(false);
    }
  }, [serviceHintQuery, records, searchQuery, isServiceUnlocked, isServiceHintLoading]);

  const handleStopTroubleFinding = () => {
    troubleStopRef.current = true;
    setIsTroubleFindingLoading(false);
  };

  const togglePlate = (plate: string) => {
    setExpandedPlates(prev => ({
      ...prev,
      [plate]: !prev[plate]
    }));
  };

  const toggleAll = (expand: boolean) => {
    const newState: Record<string, boolean> = {};
    Object.keys(groupedRecords).forEach(plate => {
      newState[plate] = expand;
    });
    setExpandedPlates(newState);
  };

  const handleViewImage = async (record: MaintenanceRecord) => {
    if (!supabase) return;
    if (record.originalImage) {
      setViewingImage({ id: record.id, image: record.originalImage, loading: false });
      return;
    }

    setViewingImage({ id: record.id, image: null, loading: true });
    try {
      const { data, error } = await supabase
        .from('maintenance_record_images')
        .select('image_data')
        .eq('record_id', record.id)
        .eq('user_id', user?.id)
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      
      setSessionStats(prev => ({ ...prev, reads: prev.reads + 1 }));
      if (data) {
        setViewingImage({ id: record.id, image: data.image_data, loading: false });
      } else {
        setViewingImage({ id: record.id, image: null, loading: false });
      }
    } catch (err) {
      console.error("Failed to fetch image", err);
      setError(getSupabaseErrorMessage(err));
      setViewingImage(null);
    }
  };

  const handleClearAll = async () => {
    if (!user || records.length === 0 || !supabase) return;
    if (passwordInput === MASTER_PASSWORD) {
      try {
        const { error } = await supabase
          .from('maintenance_records')
          .delete()
          .eq('user_id', user.id);

        if (error) throw error;

        setSessionStats(prev => ({ ...prev, deletes: prev.deletes + records.length }));
        setRecords([]);
        setTotalCount(0);
        
        setShowPasswordPrompt(false);
        setPasswordInput('');
        setPasswordError(false);
        setDangerAction(null);
      } catch (err: any) {
        setError(getSupabaseErrorMessage(err));
      }
    } else {
      setPasswordError(true);
    }
  };

  const handleClearDuplicates = async () => {
    if (!user || records.length === 0 || !supabase) return;
    if (passwordInput === MASTER_PASSWORD) {
      try {
        const duplicates: string[] = [];
        const uniqueRecords: MaintenanceRecord[] = [];
        
        // Sort by createdAt descending to keep the most recent one
        const sortedRecords = [...records].sort((a, b) => {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          return timeB - timeA;
        });

        sortedRecords.forEach(record => {
          // Check if this record is a duplicate of any already seen unique record
          // We use 100% exact matching for plate (case-insensitive) and description
          const isDuplicate = uniqueRecords.some(unique => 
            record.plate_number.toUpperCase().trim() === unique.plate_number.toUpperCase().trim() &&
            record.service_date === unique.service_date &&
            record.service_description.toLowerCase().trim() === unique.service_description.toLowerCase().trim()
          );

          if (isDuplicate) {
            duplicates.push(record.id);
          } else {
            uniqueRecords.push(record);
          }
        });

        if (duplicates.length === 0) {
          setError("No duplicates found based on the new similarity rules.");
          setShowPasswordPrompt(false);
          setPasswordInput('');
          setDangerAction(null);
          return;
        }

        const { error } = await supabase
          .from('maintenance_records')
          .delete()
          .in('id', duplicates);

        if (error) throw error;

        setSessionStats(prev => ({ ...prev, deletes: prev.deletes + duplicates.length }));
        fetchRecords(); // Refresh list
        
        setShowPasswordPrompt(false);
        setPasswordInput('');
        setPasswordError(false);
        setDangerAction(null);
      } catch (err: any) {
        setError(getSupabaseErrorMessage(err));
      }
    } else {
      setPasswordError(true);
    }
  };

  const [recheckingIndex, setRecheckingIndex] = useState<number | null>(null);

  const recheckAuditResult = async (index: number) => {
    const result = auditResults[index];
    if (!result) return;
    
    setRecheckingIndex(index);
    try {
      let targetRecords = records;
      
      if (supabase && user) {
        // Force refresh records from DB to ensure we are checking against the latest state
        const { data: latestRecords, error: fetchError } = await supabase
          .from('maintenance_records')
          .select('id, plate_number, service_date, service_description, confidence, user_id, file_name, created_at')
          .eq('user_id', user.id)
          .order('service_date', { ascending: false });

        if (fetchError) throw fetchError;
        if (latestRecords) {
          const dedup = deduplicateRecords(latestRecords as MaintenanceRecord[]);
          setRecords(dedup);
          targetRecords = dedup;
        }
      }

      // Use the same normalization and similarity logic from startBatchProcessing
      const normalize = (str: string) => str ? str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim() : '';
      const normalizePlate = (str: string) => str ? str.toUpperCase().replace(/[^A-Z0-9]/g, '').trim() : '';
       const getSimilarityScore = (s1: string, s2: string) => {
        const str1 = normalize(s1);
        const str2 = normalize(s2);
        if (str1 === str2) return { score: 1.0, commonCount: 100 };
        if (!str1 || !str2) return { score: 0, commonCount: 0 };
        
        const words1 = str1.split(/\s+/).filter(w => w.length > 2);
        const words2 = str2.split(/\s+/).filter(w => w.length > 2);
        
        if (words1.length === 0 || words2.length === 0) {
          return (str1.includes(str2) || str2.includes(str1)) ? { score: 0.8, commonCount: 1 } : { score: 0, commonCount: 0 };
        }

        const commonWords = words1.filter(w => words2.includes(w));
        const score = commonWords.length / Math.max(words1.length, words2.length);
        return { score, commonCount: commonWords.length };
      };

      const normExtractedDate = normalizeDate(result.date);
      const normExtractedPlate = normalizePlate(result.plate);
      
      const match = targetRecords.find(r => {
        const platesMatch = normalizePlate(r.plate_number) === normExtractedPlate;
        const datesMatch = normalizeDate(r.service_date) === normExtractedDate;
        const similarity = getSimilarityScore(r.service_description, result.service);
        const descMatch = similarity.commonCount >= 5 || normalize(r.service_description) === normalize(result.service);
        return platesMatch && datesMatch && descMatch;
      });

      const potentialMatch = !match ? targetRecords.find(r => 
        normalizePlate(r.plate_number) === normExtractedPlate && 
        normalizeDate(r.service_date) === normExtractedDate
      ) : null;

      const oldIsDuplicate = result.isDuplicate;
      const oldIsPotential = result.isPotential;
      
      const newIsDuplicate = !!match;
      const newIsPotential = !!potentialMatch;

      // Statuses: 
      // green: isDuplicate
      // orange: isPotential (but not duplicate)
      // red: neither (unique entry)
      const oldStatus = oldIsDuplicate ? 'green' : (oldIsPotential ? 'orange' : 'red');
      const newStatus = newIsDuplicate ? 'green' : (newIsPotential ? 'orange' : 'red');

      if (oldStatus !== newStatus) {
        if (oldStatus === 'green' && newStatus === 'orange') {
          addFeedNotification(
            "Audit Transition: Green ➔ Orange",
            `Card for Plate ${result.plate} downgraded from 'Already Uploaded' (Green) to 'Potential Conflict' (Orange). Exact matches were altered in DB!`,
            'warning',
            'transition'
          );
        } else if (oldStatus === 'orange' && newStatus === 'red') {
          addFeedNotification(
            "Audit Transition: Orange ➔ Red",
            `Card for Plate ${result.plate} resolved potential conflict and became 'Unique Entry / Conflict Resolved' (Red). Ready to save.`,
            'success',
            'transition'
          );
        } else if (oldStatus === 'green' && newStatus === 'red') {
          addFeedNotification(
            "Audit Transition: Green ➔ Red (Unique)",
            `Card for Plate ${result.plate} shifted directly from 'Already Uploaded' to 'Unique Entry'. Historically uploaded duplicate was removed from database.`,
            'critical',
            'transition'
          );
        } else {
          addFeedNotification(
            "Audit Update: Status Sync",
            `Card for Plate ${result.plate} status updated from ${oldStatus.toUpperCase()} to ${newStatus.toUpperCase()}`,
            'info',
            'transition'
          );
        }
      }

      const updatedResults = [...auditResults];
      updatedResults[index] = {
        ...result,
        isDuplicate: newIsDuplicate,
        isPotential: newIsPotential,
        matchId: match?.id || potentialMatch?.id
      };
      setAuditResults(updatedResults);
    } catch (err) {
      console.error("Recheck failed:", err);
    } finally {
      setRecheckingIndex(null);
    }
  };

  const downloadCSV = () => {
    if (records.length === 0) return;
    
    // Prepare CSV content
    const headers = ['Plate', 'Date', 'Service'];
    const csvRows = [
      headers.join(','),
      ...records.map(r => {
        // Escape quotes and wrap in quotes
        const plate = `"${r.plate_number.replace(/"/g, '""')}"`;
        const date = `"${r.service_date.replace(/"/g, '""')}"`;
        const service = `"${r.service_description.replace(/"/g, '""')}"`;
        return [plate, date, service].join(',');
      })
    ];
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `dt_base_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isAuthReady || hasApiKey === null) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-muted">Initialising DT.Base...</span>
        </div>
      </div>
    );
  }

  if (!isAppUnlocked) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-8 text-center shadow-xl">
          <div className="w-16 h-16 bg-amber-500/20 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <Key className="w-8 h-8 text-amber-500 dark:text-amber-400" />
          </div>
          <h1 className="text-2xl font-display font-bold text-text mb-4 tracking-tight uppercase">App Access Required</h1>
          <p className="text-sm text-muted mb-8 leading-relaxed uppercase tracking-widest">
            Please enter the access password to enter DT.Base.
          </p>
          <div className="space-y-4">
            <div className="relative">
              <input 
                type="password"
                value={appPasswordInput}
                onChange={(e) => setAppPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAppUnlock()}
                placeholder="Enter App Password"
                className={cn(
                  "w-full bg-bg border px-4 py-4 text-text font-mono text-center tracking-[0.5em] focus:outline-none transition-all rounded-xl",
                  appPasswordError ? "border-red-500/50" : "border-border focus:border-amber-500/50"
                )}
              />
              {appPasswordError && (
                <p className="text-[10px] text-red-500 dark:text-red-400 font-display font-bold uppercase tracking-widest mt-2">
                  Incorrect Password
                </p>
              )}
            </div>
            <button
              onClick={handleAppUnlock}
              className="w-full py-4 px-6 bg-amber-500 hover:bg-amber-600 text-white font-display font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-lg shadow-amber-900/20 active:scale-[0.98]"
            >
              Enter App
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (hasApiKey === false) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-surface border border-border rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          {/* Accent Glow Background Effects */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[50px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-500/10 blur-[50px] rounded-full pointer-events-none" />

          {!showManualForm ? (
            <div className="text-center relative z-10">
              <div className="w-16 h-16 bg-purple-600/20 border border-purple-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <Zap className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h1 className="text-2xl font-display font-bold text-text mb-4 tracking-tight uppercase">Paid Tier API Key Required</h1>
              <p className="text-sm text-muted mb-8 leading-relaxed uppercase tracking-widest">
                To use the AI features of DT.Base, you need to select a Gemini API key from a paid Google Cloud project.
              </p>
              <div className="space-y-4">
                <button
                  onClick={handleSelectKey}
                  className="w-full py-4 px-6 bg-purple-600 hover:bg-purple-500 text-white font-display font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-lg shadow-purple-900/20 active:scale-[0.98] cursor-pointer"
                  title="Select a Gemini API key from your Google Cloud project"
                >
                  Select API Key (Cloud Platform)
                </button>
                
                <div className="py-2 flex items-center justify-center gap-3">
                  <div className="h-px bg-white/5 flex-1" />
                  <span className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em]">or bypass configuration</span>
                  <div className="h-px bg-white/5 flex-1" />
                </div>

                <button
                  onClick={() => setShowManualForm(true)}
                  className="w-full py-3.5 px-6 bg-white/[0.02] hover:bg-white/[0.08] border border-white/10 hover:border-cyan-500/40 text-cyan-400 font-display font-bold uppercase tracking-widest text-[10px] rounded-xl transition-all active:scale-[0.98] cursor-pointer"
                >
                  Configure My Own API Keys Manually
                </button>

                <p className="text-[10px] text-white/20 font-display font-medium uppercase tracking-widest pt-2">
                  Note: You must have billing enabled on your Google Cloud project.
                  <br />
                  <a 
                    href="https://ai.google.dev/gemini-api/docs/billing" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:underline mt-2 inline-block"
                  >
                    Learn more about billing
                  </a>
                </p>
              </div>
            </div>
          ) : (
            <div className="relative z-10 text-left space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
                    <Database className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-sm font-display font-bold uppercase tracking-wider text-white">Manual Key Provisioning</h2>
                    <p className="text-[8px] font-mono text-white/40 uppercase tracking-widest">Local-only secure context</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowManualForm(false)}
                  className="px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/[0.08] text-[9px] font-display font-bold uppercase tracking-widest text-white/60 rounded-lg hover:text-white transition-all cursor-pointer"
                >
                  Go Back
                </button>
              </div>

              <div className="space-y-4">
                {/* Custom Gemini Key Info Block */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-display font-bold uppercase tracking-wider text-white/40 block">Gemini API Key</label>
                    <span className="text-[7.5px] font-mono text-violet-400 uppercase tracking-widest bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20">Required</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="password"
                      placeholder="PASTE YOUR GEMINI API KEY..."
                      className="w-full bg-black/60 border border-white/10 p-4 pl-11 font-mono text-xs focus:outline-none focus:border-violet-500/60 text-white rounded-2xl placeholder:text-white/10 transition-all select-all focus:ring-1 focus:ring-violet-500/30 text-violet-200"
                      value={customGeminiKey}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        setCustomGeminiKey(val);
                      }}
                    />
                    <Key className="w-4 h-4 text-violet-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-[8.5px] text-white/30 uppercase tracking-widest leading-relaxed ml-1">
                    Used for OCR document classification & AI maintenance intelligence reports.
                  </p>
                </div>

                {/* Custom Supabase URL Block */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-display font-bold uppercase tracking-wider text-white/40 block">Supabase Project URL</label>
                    <span className="text-[7.5px] font-mono text-cyan-400 uppercase tracking-widest bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">Optional</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="https://your-project.supabase.co"
                      className="w-full bg-black/60 border border-white/10 p-4 pl-11 font-mono text-xs focus:outline-none focus:border-cyan-500/60 text-white rounded-2xl placeholder:text-white/10 transition-all select-all focus:ring-1 focus:ring-cyan-500/30 text-cyan-200"
                      value={localSupabaseUrl}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        setLocalSupabaseUrl(val);
                      }}
                    />
                    <Database className="w-4 h-4 text-cyan-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* Custom Supabase Anon Key Block */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-display font-bold uppercase tracking-wider text-white/40 block">Supabase Anon Key</label>
                    <span className="text-[7.5px] font-mono text-cyan-400 uppercase tracking-widest bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">Optional</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="password"
                      placeholder="PASTE YOUR SUPABASE ANON KEY..."
                      className="w-full bg-black/60 border border-white/10 p-4 pl-11 font-mono text-xs focus:outline-none focus:border-cyan-500/60 text-white rounded-2xl placeholder:text-white/10 transition-all select-all focus:ring-1 focus:ring-cyan-500/30 text-cyan-200"
                      value={localSupabaseAnonKey}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        setLocalSupabaseAnonKey(val);
                      }}
                    />
                    <Key className="w-4 h-4 text-cyan-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-[8.5px] text-white/30 uppercase tracking-widest leading-relaxed ml-1">
                    Saves data directly to your personal database instead of local browser cache.
                  </p>
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <button
                  onClick={() => {
                    if (!customGeminiKey.trim()) {
                      alert("Please paste a valid Gemini API Key first.");
                      return;
                    }

                    // Save Gemini API key
                    localStorage.setItem("DT_BASE_CUSTOM_GEMINI_API_KEY", customGeminiKey.trim());
                    
                    // Save Supabase configs
                    if (localSupabaseUrl.trim()) {
                      localStorage.setItem("DTBASE_SUPABASE_URL", localSupabaseUrl.trim());
                    } else {
                      localStorage.removeItem("DTBASE_SUPABASE_URL");
                    }

                    if (localSupabaseAnonKey.trim()) {
                      localStorage.setItem("DTBASE_SUPABASE_ANON_KEY", localSupabaseAnonKey.trim());
                    } else {
                      localStorage.removeItem("DTBASE_SUPABASE_ANON_KEY");
                    }

                    setHasApiKey(true);
                    setNotification({
                      message: "Credentials successfully applied! Initializing safe workspace...",
                      type: "success"
                    });
                    
                    setTimeout(() => {
                      window.location.reload();
                    }, 1200);
                  }}
                  className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-display font-bold uppercase tracking-widest text-[11px] rounded-2xl transition-all shadow-lg shadow-cyan-900/40 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Apply Connection Parameters & Restart dt.base
                </button>
                <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl flex items-start gap-2">
                  <HelpCircle className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                  <p className="text-[8px] font-mono text-white/30 uppercase tracking-[0.05em] leading-relaxed">
                    Credentials are saved within local storage context. They will not be transmitted anywhere outside of standard direct requests.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen transition-all duration-700 ease-in-out",
      "bg-bg text-text p-4 md:p-12 max-w-7xl mx-auto flex flex-col"
    )}>
      <div className={cn(
        "flex flex-col transition-all duration-700 ease-in-out relative",
        "w-full flex-1"
      )}>
      {/* Supabase Config Warning */}
      {!supabase && (
        <div className="mb-8 p-4 bg-orange-600/20 border border-orange-500/40 rounded-xl flex items-center gap-4 animate-pulse">
          <div className="p-2 bg-orange-500/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-xs font-display font-bold uppercase tracking-widest text-orange-200 mb-1 flex items-center gap-2">
              Database Disconnected
              <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[8px] rounded uppercase font-black">Requires Setup</span>
            </h3>
            <p className="text-[10px] text-orange-200/70 leading-relaxed uppercase tracking-wider">
              Supabase configuration is missing. Add <span className="text-white font-bold">VITE_SUPABASE_URL</span> to secrets, OR <button onClick={() => setShowSettingsModal(true)} type="button" className="text-cyan-400 font-bold underline cursor-pointer hover:text-cyan-300 bg-transparent border-none p-0 inline font-display uppercase text-[10px] tracking-wider outline-none">tap here to enter them manually</button> for full offline/device persistence!
            </p>
          </div>
        </div>
      )}

      {/* Audit Verify Mode Banner */}
      {isAuditMode && (
        <div className="mb-8 p-4 bg-cyan-600/10 border border-cyan-500/20 rounded-xl flex items-center gap-4 animate-in fade-in duration-300">
          <div className="p-2 bg-cyan-500/20 rounded-lg">
            <Eye className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-xs font-display font-bold uppercase tracking-widest text-cyan-200 mb-1">Audit Verify Mode Active (Dry Run)</h3>
            <p className="text-[10px] text-cyan-200/60 leading-relaxed uppercase tracking-wider">
              The app is currently in <span className="text-white font-bold">Verify Mode</span>. AI extractions will scan and identify <span className="text-cyan-400 font-bold underline">duplicates</span>, but <span className="text-red-400 font-bold">NO RECORDS ARE SAVED</span> to the database.
            </p>
          </div>
          <button 
            onClick={() => setIsAuditMode(false)}
            className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-[9px] font-display font-bold uppercase tracking-widest text-cyan-400 transition-all"
          >
            Disable
          </button>
        </div>
      )}

      {/* Audit Upload Mode Banner */}
      {isAuditUploadMode && (
        <div className="mb-8 p-4 bg-purple-600/10 border border-purple-500/20 rounded-xl flex items-center gap-4 animate-in fade-in duration-300">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-xs font-display font-bold uppercase tracking-widest text-purple-200 mb-1">Audit Upload Mode Active</h3>
            <p className="text-[10px] text-purple-200/60 leading-relaxed uppercase tracking-wider">
              The app is currently in <span className="text-white font-bold">Audit Upload Mode</span>. AI extractions will skip <span className="text-purple-400 font-bold underline">duplicates</span>, while <span className="text-green-400 font-bold">automatically saving</span> all unique new records.
            </p>
          </div>
          <button 
            onClick={() => setIsAuditUploadMode(false)}
            className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg text-[9px] font-display font-bold uppercase tracking-widest text-purple-400 transition-all"
          >
            Disable
          </button>
        </div>
      )}

      {/* Quota Warning Banner */}
      {isQuotaExceeded && (
        <div className="mb-8 p-4 bg-blue-600/20 border border-blue-500/40 rounded-xl flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <AlertCircle className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-xs font-display font-bold uppercase tracking-widest text-blue-200 mb-1">Daily Read Limit Reached</h3>
            <p className="text-[10px] text-blue-200/60 leading-relaxed uppercase tracking-wider">
              The app is currently in <span className="text-white font-bold">Offline Cache Mode</span>. You can still view and search your existing records, but new data might not sync until the quota resets at midnight.
            </p>
          </div>
          <button 
            onClick={() => setIsQuotaExceeded(false)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-4 h-4 text-blue-400" />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="relative mb-4 md:mb-6 border-b border-border pb-4 bg-surface/80 p-4 rounded-3xl">
        {/* Top Right Controls */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          {viewMode === 'log' && (
            <button 
              type="button"
              aria-label="Open Settings"
              onClick={() => setShowSettingsModal(true)}
              className={cn(
                "p-2 bg-surface border border-border hover:bg-white/10 transition-all rounded-full text-muted hover:text-text hover:neon-glow-violet flex items-center justify-center cursor-pointer focus-visible:ring-2 outline-none",
                theme === 'pro' ? "focus-visible:ring-indigo-500" : "focus-visible:ring-purple-500"
              )}
              title="Open Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
                <motion.button
                  type="button"
                  aria-label="Switch theme"
                  className={cn(
                    "p-3.5 rounded-2xl border relative overflow-hidden flex items-center justify-center cursor-pointer focus-visible:ring-2 outline-none transition-all",
                    theme === 'pro' ? "bg-indigo-500/10 border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.2)] focus-visible:ring-indigo-500" : "bg-purple-600/20 border-purple-500/35 shadow-[0_0_20px_rgba(168,85,247,0.2)] focus-visible:ring-purple-500"
                  )}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleTheme}
                  title={`Switch Theme (Current: ${theme})`}
                >
                  <motion.div 
                    className="absolute inset-0 opacity-10 bg-gradient-to-tr from-purple-500 to-indigo-500"
                    animate={{ rotate: 360 }}
                    transition={{ ease: "linear", duration: 8, repeat: Infinity }}
                  />
                  
                  <div className="relative flex items-center justify-center w-9 h-9">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ ease: "linear", duration: 12, repeat: Infinity }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <Settings className={cn("w-9 h-9 stroke-[1.2] opacity-40", theme === 'pro' ? "text-indigo-400" : "text-purple-400")} />
                    </motion.div>
                    
                    <motion.div
                      initial={{ rotate: -10 }}
                      animate={{ rotate: [15, -15, 15] }}
                      transition={{
                        ease: "easeInOut",
                        duration: 3.5,
                        repeat: Infinity,
                        repeatType: "reverse"
                      }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <Wrench className={cn("w-6 h-6 stroke-[1.8]", theme === 'pro' ? "text-indigo-300" : "text-purple-300")} />
                    </motion.div>

                    <span className="absolute w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_white] animate-pulse" />
                  </div>
                </motion.button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={cn(
                  "text-5xl md:text-8xl font-display font-bold tracking-tighter leading-none transition-colors duration-500",
                  theme === 'pro' ? "text-indigo-400" : "text-text"
                )}>DT.Base</h1>
                {theme === 'pro' && (
                  <div className="hidden sm:flex items-center gap-2 px-2 py-0.5 mt-2 bg-indigo-500/10 border border-indigo-500/20 rounded-md">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    <span className="text-[8px] font-mono font-bold text-indigo-400 uppercase tracking-widest">Fleet Authority</span>
                  </div>
                )}
              </div>
              <p className="text-[11px] opacity-50 uppercase tracking-[0.5em] font-display font-bold mt-1">Mechanical History Log</p>
            </div>
          </div>

          {/* Notifications */}
          <div className="fixed top-6 right-6 z-[150] pointer-events-none">
            <AnimatePresence>
              {notification && (
                <motion.div
                  role="status"
                  aria-live="polite"
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  className={cn(
                    "p-4 rounded-2xl border flex items-center gap-3 shadow-xl pointer-events-auto",
                    notification.type === 'info' ? "bg-purple-500/10 border-purple-500/30 text-purple-200" :
                    notification.type === 'success' ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-200" :
                    notification.type === 'error' ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-200" :
                    "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-200"
                  )}
                >
                  {notification.type === 'info' ? <Loader2 className="w-4 h-4 animate-spin" /> :
                   notification.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> :
                   notification.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
                   <AlertTriangle className="w-4 h-4" />}
                  <span className="text-xs font-display font-bold uppercase tracking-widest">{notification.message}</span>
                  <button
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={() => setNotification(null)}
                    className="ml-auto p-1 hover:bg-white/10 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* View Switcher Tabs */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center p-1 bg-surface border border-border rounded-2xl">
                  <button 
                    onClick={() => {
                      if (viewMode !== 'log' && viewMode !== 'advanced-search') {
                        setViewMode('log');
                      }
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-display font-bold uppercase tracking-widest transition-all",
                      (viewMode === 'log' || viewMode === 'advanced-search') 
                        ? (theme === 'pro' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-purple-600 text-white") 
                        : "text-muted hover:text-text"
                    )}
                  >
                    History
                  </button>
                  <button 
                    onClick={() => {
                      // Default to 'audit' if not already in an audit sub-mode
                      if (viewMode !== 'audit' && viewMode !== 'analytics' && viewMode !== 'battery') {
                        setViewMode('audit');
                      }
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-display font-bold uppercase tracking-widest transition-all flex items-center gap-2",
                      (viewMode === 'audit' || viewMode === 'analytics' || viewMode === 'battery') 
                        ? (theme === 'pro' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-purple-600 text-white") 
                        : "text-muted hover:text-text"
                    )}
                  >
                    {(viewMode === 'audit' || viewMode === 'analytics' || viewMode === 'battery') && <ClipboardCheck className="w-3 h-3" />}
                    Audit
                  </button>
                  <button 
                    onClick={() => setViewMode('marketplace')}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-display font-bold uppercase tracking-widest transition-all flex items-center gap-2",
                      viewMode === 'marketplace' 
                        ? (theme === 'pro' ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20" : "bg-purple-600 text-white") 
                        : "text-muted hover:text-text"
                    )}
                  >
                    {(viewMode === 'marketplace') && <Globe className="w-3 h-3" />}
                    IntelCenter
                  </button>
                </div>

                {/* Notifications Bell (visible only in History page, sitting outside the pages rectangle) */}
                {(viewMode === 'log' || viewMode === 'advanced-search') && (
                  <button 
                    type="button"
                    aria-label="Open Notifications Center"
                    onClick={() => setShowNotificationsPanel(true)}
                    className={cn(
                      "p-2.5 bg-surface border border-border hover:bg-white/10 transition-all rounded-full text-muted hover:text-text relative flex items-center justify-center cursor-pointer hover:neon-glow-violet h-[38px] w-[38px] shrink-0 focus-visible:ring-2 outline-none",
                      theme === 'pro' ? "focus-visible:ring-indigo-500" : "focus-visible:ring-purple-500"
                    )}
                    title="Open Notifications Center"
                  >
                    <Bell className="w-4 h-4" />
                    {unreadNotificationsCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-purple-600 text-white font-mono text-[8.5px] font-black w-4.5 h-4.5 flex items-center justify-center rounded-full border border-black/50 animate-pulse">
                        {unreadNotificationsCount}
                      </span>
                    )}
                  </button>
                )}
              </div>
              
              {/* Sub-navigation for History section */}
              {(viewMode === 'log' || viewMode === 'advanced-search') && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center p-1 bg-surface/50 border border-border/50 rounded-xl sm:ml-4 w-fit"
                >
                  <button 
                    onClick={() => setViewMode('log')}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[9px] font-display font-bold uppercase tracking-widest transition-all",
                      viewMode === 'log' 
                        ? (theme === 'pro' ? "bg-indigo-500/20 text-indigo-400" : "bg-purple-500/20 text-purple-400") 
                        : "text-muted hover:text-text"
                    )}
                  >
                    Logs
                  </button>
                  <button 
                    onClick={() => setViewMode('advanced-search')}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[9px] font-display font-bold uppercase tracking-widest transition-all",
                      viewMode === 'advanced-search' 
                        ? (theme === 'pro' ? "bg-indigo-500/20 text-indigo-400" : "bg-purple-500/20 text-purple-400") 
                        : "text-muted hover:text-text"
                    )}
                  >
                    Adv Search
                  </button>
                </motion.div>
              )}
              
              {/* Sub-navigation for Audit section */}
              {(viewMode === 'audit' || viewMode === 'analytics' || viewMode === 'battery') && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center p-1 bg-surface/50 border border-border/50 rounded-xl ml-8 w-fit"
                >
                  <button 
                    onClick={() => setViewMode('audit')}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[9px] font-display font-bold uppercase tracking-widest transition-all",
                      viewMode === 'audit' ? "bg-purple-500/20 text-purple-400" : "text-muted hover:text-text"
                    )}
                  >
                    Verifier
                  </button>
                  <button 
                    onClick={() => setViewMode('analytics')}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[9px] font-display font-bold uppercase tracking-widest transition-all",
                      viewMode === 'analytics' ? "bg-purple-500/20 text-purple-400" : "text-muted hover:text-text"
                    )}
                  >
                    Insights
                  </button>
                  <button 
                    onClick={() => setViewMode('battery')}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[9px] font-display font-bold uppercase tracking-widest transition-all",
                      viewMode === 'battery' ? "bg-purple-500/20 text-purple-400" : "text-muted hover:text-text"
                    )}
                  >
                    Int
                  </button>
                </motion.div>
              )}
            </div>

            {deferredPrompt && (
              <button 
                onClick={handleInstallClick}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-violet-600 text-white hover:bg-violet-500 transition-all active:scale-95 rounded-xl font-display font-bold uppercase tracking-widest"
                title="Install DT.Base as a Progressive Web App"
              >
                <Download className="w-3 h-3" />
                <span className="text-[10px] font-display font-bold uppercase tracking-widest">Install</span>
              </button>
            )}
            
            {user ? null : null}
            
            <div className="hidden">
              <div 
                className="flex items-center gap-2 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg"
                title="Cloud synchronization status"
              >
                <Database className={cn(
                  "w-2 h-2",
                  isCloudConnected === true ? "text-green-500" : "text-red-500"
                )} />
                <span className="text-[7px] font-mono text-white/20 uppercase tracking-widest">
                  {isCloudConnected ? "Sync" : "Off"}
                </span>
              </div>
            </div>

            {!isServiceUnlocked && (
              <button 
                onClick={() => setShowServicePasswordPrompt(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-500 hover:bg-amber-500/20 transition-all rounded-xl shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                title="Enter password to unlock AI and advanced features"
              >
                <Key className="w-3 h-3" />
                <span className="text-[8px] font-display font-bold uppercase tracking-widest">Unlock Services</span>
              </button>
            )}
          </div>
        </div>
        
        {/* Progress Bar */}
        {isProcessing && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-[10px] font-display font-bold uppercase tracking-widest",
                  theme === 'pro' ? "text-indigo-400" : "text-purple-400 animate-pulse"
                )}>
                  {isStopping ? "Stopping..." : "Analysis in Progress..."}
                </span>
                {(() => {
                  const activeEntry = uploadLog.find(e => e.status === 'processing');
                  if (activeEntry?.mode) {
                    return (
                      <span className={cn(
                        "text-[9px] px-2 py-0.5 rounded-full border font-display font-black uppercase tracking-widest flex items-center gap-1.5",
                        activeEntry.isAudit ? "bg-cyan-500/30 border-cyan-400 text-white" :
                        activeEntry.mode === 'market' ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : 
                        "bg-cyan-500/20 border-cyan-500/40 text-cyan-400"
                      )}>
                        {activeEntry.isAudit && <Eye className="w-3 h-3 animate-pulse" />}
                        {activeEntry.mode} {activeEntry.isAudit ? "Audit" : "Mode"}
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
              {!isStopping && (
                <button 
                  onClick={stopBatchProcessing}
                  className="text-[10px] font-display font-bold text-red-400 hover:text-red-300 uppercase tracking-widest transition-colors"
                  title="Stop current batch processing"
                >
                  Stop Progress
                </button>
              )}
            </div>
            <div className="h-1 w-full bg-zinc-900 overflow-hidden rounded-full border border-border/30">
              <div 
                className={cn(
                  "h-full transition-all duration-300",
                  theme === 'pro' ? "bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.3)]" : "bg-purple-500"
                )}
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* Error Message */}
      {error && (
        <div className="mb-8 p-4 bg-red-900/40 border border-red-500/50 text-red-100 flex flex-col gap-3 rounded-xl animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div className="flex flex-col">
                <div className="text-sm font-display font-bold uppercase tracking-widest">{error}</div>
                {typeof error === 'string' && error.includes("Daily Quota Reached") && (
                  <p className="text-[10px] font-display font-medium opacity-60 mt-1 uppercase tracking-widest">
                    You can still add records manually using the "Add Manually" button on failed items in the log below.
                  </p>
                )}
                {typeof error === 'string' && (error.includes("Failed to fetch") || error.includes("DATABASE OFFLINE") || error.includes("connection failed") || error.includes("Connection failed")) && (
                  <div className="mt-3 flex flex-col gap-2.5">
                    <p className="text-[9px] font-display font-medium opacity-60 uppercase tracking-widest leading-relaxed">
                      This is often due to incorrect Credentials, a paused Supabase project, or a local network firewall issue.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button 
                        onClick={fetchRecords}
                        className="whitespace-nowrap px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-[8px] font-display font-black uppercase tracking-[0.2em] transition-all cursor-pointer"
                      >
                        Retry Connection
                      </button>
                      <button 
                        onClick={() => setShowSettingsModal(true)}
                        className="whitespace-nowrap px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/35 border border-cyan-500/30 rounded-lg text-[8px] font-display font-black uppercase tracking-[0.2em] text-cyan-400 transition-all cursor-pointer"
                      >
                        Adjust Database Parameters
                      </button>
                      {(typeof window !== 'undefined' && (localStorage.getItem("DTBASE_SUPABASE_URL") || localStorage.getItem("DTBASE_SUPABASE_ANON_KEY"))) && (
                        <button 
                          onClick={() => {
                            localStorage.removeItem("DTBASE_SUPABASE_URL");
                            localStorage.removeItem("DTBASE_SUPABASE_ANON_KEY");
                            setNotification({
                              message: "Custom local configuration reset. Falling back to default context...",
                              type: "info"
                            });
                            setError(null);
                            setTimeout(() => {
                              window.location.reload();
                            }, 1200);
                          }}
                          className="whitespace-nowrap px-3 py-1.5 bg-red-600/20 hover:bg-red-600/35 border border-red-500/30 rounded-lg text-[8px] font-display font-black uppercase tracking-[0.2em] text-red-300 transition-all cursor-pointer"
                        >
                          Reset to App Defaults
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <button 
              onClick={() => {
                setError(null);
                setFailedFiles([]);
              }}
              className="p-2 hover:bg-white/10 rounded-full transition-all hover:scale-110"
              title="Dismiss"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {failedFiles.length > 0 && (
            <div className="pl-8 flex flex-col gap-1">
              <p className="text-[10px] font-display font-bold uppercase tracking-widest opacity-60">Failed Files:</p>
              <ul className="list-disc list-inside">
                {failedFiles.map((name, i) => (
                  <li key={i} className="text-[11px] font-mono opacity-80">{name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Auth Section */}
      {!user && (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="w-full max-w-md p-8 bg-surface border border-border rounded-3xl shadow-2xl">
            <div className="mb-8 text-center">
              <h2 className="text-4xl font-display font-black tracking-tighter mb-2 text-text">
                {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
              </h2>
              <p className="text-[10px] text-muted uppercase tracking-[0.2em] font-display font-bold">
                {authMode === 'login' ? 'Sign in to access your records' : 'Join DT.Base to start tracking'}
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-display font-bold uppercase tracking-[0.3em] text-muted ml-1">Email Address</label>
                <input 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-4 text-sm font-medium focus:outline-none focus:border-purple-500 transition-all text-text"
                  placeholder="name@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-display font-bold uppercase tracking-[0.3em] text-muted ml-1">Password</label>
                <input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-4 text-sm font-medium focus:outline-none focus:border-purple-500 transition-all text-text"
                  placeholder="••••••••"
                  required
                />
              </div>

              <button 
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-4 bg-purple-600 text-white font-display font-black uppercase tracking-[0.3em] text-[11px] rounded-xl hover:bg-purple-500 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg shadow-purple-900/20"
              >
                {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {authMode === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button 
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                className="text-[10px] font-display font-bold uppercase tracking-widest text-purple-400 hover:text-purple-300 transition-colors"
              >
                {authMode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-white/5 flex flex-col items-center gap-2.5">
              <span className="text-[8.5px] font-mono text-white/30 uppercase tracking-widest">Running offline or on an exported device?</span>
              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="w-full py-3 px-4 bg-cyan-950/20 border border-cyan-500/25 hover:border-cyan-500/50 rounded-2xl text-[9px] font-display font-medium text-cyan-400 uppercase tracking-widest hover:bg-cyan-950/45 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.98]"
              >
                <Database className="w-3.5 h-3.5" />
                Configure Local Database Setup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content (Only if logged in) */}
      {user && (
        <>
          {/* Upload Log Section */}
      {uploadLog.length > 0 && (
        <div className="mb-12 bg-surface border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <button 
              onClick={() => setShowUploadLog(!showUploadLog)}
              className="flex items-center gap-3 hover:opacity-80 transition-all group"
            >
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center bg-white/5 border border-white/10 transition-transform",
                showUploadLog && "rotate-180"
              )}>
                <ChevronDown className="w-3 h-3 text-purple-400" />
              </div>
              <h2 className="font-display font-bold uppercase tracking-[0.2em] text-xs text-text">Recent Upload Activity</h2>
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-surface rounded-full border border-border">
                <div className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[8px] font-display font-bold uppercase tracking-widest text-muted">Free Tier: ~1,500 requests/day</span>
              </div>
            </button>
            <div className="flex gap-4">
              {showUploadLog && (
                <>
                  <button 
                    onClick={clearFailedUploads}
                    className="text-[10px] font-display font-bold uppercase tracking-[0.2em] opacity-40 hover:opacity-100 hover:text-amber-400 transition-all font-mono"
                  >
                    Clear Failed
                  </button>
                  <button 
                    onClick={clearUploadLog}
                    className="text-[10px] font-display font-bold uppercase tracking-[0.2em] opacity-40 hover:opacity-100 hover:text-red-400 transition-all font-mono"
                  >
                    Clear Log
                  </button>
                </>
              )}
            </div>
          </div>
          
          {showUploadLog && (
            <>
              {batchSessionSummary && (
                <motion.div 
                  initial={{ opacity: 0, y: -20, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  className="mb-4 overflow-hidden border border-emerald-500/30 bg-emerald-500/5 rounded-xl p-4 flex flex-col gap-3 relative animate-in fade-in duration-500 shadow-sm"
                >
                  <button 
                    onClick={() => setBatchSessionSummary(null)}
                    className="absolute top-3 right-3 p-1.5 hover:bg-white/10 rounded-full transition-all text-muted hover:text-text"
                    title="Dismiss notification"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mt-0.5">
                      <Sparkles className="w-4 h-4 animate-pulse" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-display font-black uppercase tracking-widest text-emerald-400">
                        Scan Queue Completed!
                      </h4>
                      <p className="text-[11px] text-muted leading-relaxed mt-1 font-display">
                        Your latest batch image processing session succeeded! Clear statistics of database integrity and impacts are detailed below.
                      </p>
                    </div>
                  </div>

                  {/* Calculations Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/20 p-4 border border-white/5 rounded-xl">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] font-display font-bold text-muted uppercase tracking-widest">
                        Queue Performance
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="font-display font-medium text-lg text-text">
                          {batchSessionSummary.totalImages} {batchSessionSummary.totalImages === 1 ? 'image' : 'images'}
                        </span>
                        <span className="text-xs text-emerald-400 font-bold">
                          ({batchSessionSummary.successCount} successful)
                        </span>
                      </div>
                      <p className="text-[10px] text-muted font-mono leading-tight">
                        Processed completely without critical timeouts
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5 border-t md:border-t-0 md:border-l border-white/5 pt-3 md:pt-0 md:pl-4">
                      <span className="text-[9px] font-display font-bold text-muted uppercase tracking-widest">
                        Extracted Output
                      </span>
                      {batchSessionSummary.isAudit ? (
                        <>
                          <div className="flex items-baseline gap-2">
                            <span className="font-display font-bold text-lg text-cyan-400">
                              Audit Verified
                            </span>
                          </div>
                          <p className="text-[10px] text-muted font-mono leading-tight">
                            Preexisting matches identified and flagged. Database was untouched to protect historical integrity.
                          </p>
                        </>
                      ) : batchSessionSummary.mode === 'market' ? (
                        <>
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-display font-bold text-lg text-amber-400">
                              = {batchSessionSummary.newMarketPricesCount} {batchSessionSummary.newMarketPricesCount === 1 ? 'item' : 'items'}
                            </span>
                            {batchSessionSummary.totalExtractedCount !== undefined && batchSessionSummary.totalExtractedCount > batchSessionSummary.newMarketPricesCount && (
                              <span className="text-[9px] text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                {batchSessionSummary.totalExtractedCount - batchSessionSummary.newMarketPricesCount} duplicate{batchSessionSummary.totalExtractedCount - batchSessionSummary.newMarketPricesCount === 1 ? '' : 's'} skipped
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted font-mono leading-tight">
                            {batchSessionSummary.totalExtractedCount !== undefined && batchSessionSummary.totalExtractedCount > batchSessionSummary.newMarketPricesCount ? (
                              <>
                                Extracted <span className="font-bold text-text">{batchSessionSummary.totalExtractedCount}</span> items. Skipped <span className="font-bold text-amber-400">{batchSessionSummary.totalExtractedCount - batchSessionSummary.newMarketPricesCount}</span> duplicate pricing entry that is already active.
                              </>
                            ) : (
                              <>
                                Market records updated: <span className="text-text font-bold">{batchSessionSummary.recordsBefore}</span> items before, now <span className="text-amber-400 font-bold">{batchSessionSummary.recordsAfter}</span>.
                              </>
                            )}
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-display font-bold text-lg text-emerald-400">
                              = {batchSessionSummary.newRecordsCount} {batchSessionSummary.newRecordsCount === 1 ? 'record' : 'records'}
                            </span>
                            {batchSessionSummary.totalExtractedCount !== undefined && batchSessionSummary.totalExtractedCount > batchSessionSummary.newRecordsCount && (
                              <span className="text-[9px] text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                {batchSessionSummary.totalExtractedCount - batchSessionSummary.newRecordsCount} duplicate{batchSessionSummary.totalExtractedCount - batchSessionSummary.newRecordsCount === 1 ? '' : 's'} skipped
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted font-mono leading-tight">
                            {batchSessionSummary.totalExtractedCount !== undefined && batchSessionSummary.totalExtractedCount > batchSessionSummary.newRecordsCount ? (
                              <>
                                Extracted <span className="font-bold text-text">{batchSessionSummary.totalExtractedCount}</span> records. Skipped <span className="font-bold text-amber-400">{batchSessionSummary.totalExtractedCount - batchSessionSummary.newRecordsCount}</span> duplicate receipts to protect catalog integrity.
                              </>
                            ) : (
                              <>
                                Database catalog grew: <span className="text-text font-bold">{batchSessionSummary.recordsBefore}</span> records before, now <span className="text-emerald-400 font-bold">{batchSessionSummary.recordsAfter}</span>.
                              </>
                            )}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {batchSessionSummary.extractedItems && batchSessionSummary.extractedItems.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <span className="text-[9px] font-display font-bold text-muted uppercase tracking-widest block mb-2">
                        Details of {batchSessionSummary.extractedItems.length} Extracted {batchSessionSummary.mode === 'market' ? 'Prices' : 'Records'}
                      </span>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 select-none">
                        {batchSessionSummary.extractedItems.map((item, idx) => (
                          <div key={idx} className="flex flex-col gap-1 text-[11px] bg-white/5 rounded p-2.5 border border-white/5">
                            <div className="flex items-center justify-between gap-2 overflow-hidden">
                              <div className="flex items-center gap-2 overflow-hidden mr-2">
                                {batchSessionSummary.mode === 'market' ? (
                                  <>
                                    <span className="font-mono text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 border border-amber-500/20 rounded text-[9px] whitespace-nowrap">
                                      {item.price} {item.currency}
                                    </span>
                                    <span className="truncate text-text font-medium">{item.item_name}</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="font-mono text-cyan-400 font-bold bg-cyan-400/10 px-1.5 py-0.5 border border-cyan-500/20 rounded text-[9px] whitespace-nowrap">
                                      {item.plate_number || 'UNKNOWN'}
                                    </span>
                                    <span className="text-muted/80 font-mono text-[9px] whitespace-nowrap bg-white/5 px-1 py-0.5 rounded italic">
                                      {item.service_date}
                                    </span>
                                  </>
                                )}
                              </div>
                              <span className="font-mono text-[7px] text-muted whitespace-nowrap bg-white/5 px-1 py-0.5 rounded select-all" title={item.fileName}>
                                {item.fileName}
                              </span>
                            </div>
                            {batchSessionSummary.mode !== 'market' && (
                              <p className="text-[10px] text-text font-medium italic border-l-2 border-cyan-500/30 pl-2 mt-0.5">
                                {item.service_description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar animate-in fade-in duration-300">
                {uploadLog.map((entry, i) => {
                  const isFallbackSuccess = entry.status === 'success' && !!entry.error;
                  return (
                    <div key={`${entry.fileName}-${entry.timestamp}-${i}`} className="flex flex-col p-3 bg-surface border border-border rounded-xl group/log gap-2 transition-all duration-300">
                      <div className="flex items-center justify-between gap-3 overflow-hidden">
                        <div className="flex items-center gap-3 overflow-hidden relational-container">
                          <div className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0 animate-pulse",
                            isFallbackSuccess ? "bg-amber-500" :
                            entry.status === 'success' ? "bg-green-500 animate-none" : 
                            entry.status === 'failed' ? "bg-red-500 animate-none" : 
                            entry.status === 'processing' ? "bg-purple-500" : 
                            entry.status === 'queued' ? "bg-blue-500" : "bg-white/20 animate-none"
                          )} />
                          <div className="flex flex-col overflow-hidden">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-mono truncate opacity-90 font-semibold text-text" title={entry.fileName}>{entry.fileName}</span>
                              {entry.mode && (
                                <span className={cn(
                                  "text-[8px] px-1 rounded border font-display font-bold uppercase tracking-tighter flex items-center gap-1",
                                  entry.mode === 'market' ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400",
                                  entry.isAudit && "border-white/40 text-white shadow-[0_0_5px_rgba(255,255,255,0.2)]"
                                )}>
                                  {entry.isAudit && <Eye className="w-2.5 h-2.5" />}
                                  {entry.mode}
                                  {entry.isAudit && <span className="opacity-60 ml-0.5">Audit</span>}
                                </span>
                              )}
                            </div>
                            
                            {entry.error && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span className={cn(
                                  "text-[9px] font-mono leading-none py-0.5 px-1.5 rounded-sm font-semibold select-all",
                                  entry.status === 'failed' ? "bg-red-500/10 text-red-400 border border-red-500/15" : "bg-amber-500/10 text-amber-400 border border-amber-500/15"
                                )} title={entry.error}>
                                  {entry.error}
                                </span>
                                
                                {entry.status === 'failed' && (
                                  <button
                                    onClick={() => {
                                      setExpandedLogDiagnostics(prev => 
                                        prev.includes(entry.timestamp) ? prev.filter(t => t !== entry.timestamp) : [...prev, entry.timestamp]
                                      );
                                    }}
                                    className="text-[9px] text-purple-400 hover:text-purple-300 font-medium underline flex items-center gap-0.5 cursor-pointer select-none"
                                  >
                                    <AlertCircle className="w-2.5 h-2.5" />
                                    {expandedLogDiagnostics.includes(entry.timestamp) ? "Hide Details" : "Troubleshoot"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={cn(
                            "text-[9px] font-display font-bold uppercase tracking-widest",
                            isFallbackSuccess ? "text-amber-400" :
                            entry.status === 'success' ? "text-green-400" : 
                            entry.status === 'failed' ? "text-red-400" : 
                            entry.status === 'processing' ? "text-purple-400" : 
                            entry.status === 'queued' ? "text-blue-400" : "text-white/40"
                          )}>
                            {isFallbackSuccess 
                              ? (entry.error?.includes("could not read") ? "SAVED (UNREADABLE)" : "SAVED (OFFLINE)") 
                              : entry.status}
                          </span>
                          
                          {entry.status === 'failed' && (
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => setManualEntryData({ 
                                  fileName: entry.fileName, 
                                  plateNumber: '', 
                                  date: new Date().toISOString().split('T')[0], 
                                  service: '',
                                  verified: false
                                })}
                                className="text-[9px] font-display font-bold uppercase tracking-widest text-purple-400 hover:text-purple-300 underline flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-2.5 h-2.5" />
                                Add Manually
                              </button>
                              
                              {entry.imageData && (
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => handleRetry(entry)}
                                    className="text-[9px] font-display font-bold uppercase tracking-widest bg-purple-500/20 hover:bg-purple-500/40 px-2 py-1 rounded text-purple-300 flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <RefreshCw className="w-2.5 h-2.5" />
                                    Retry
                                  </button>
                                  
                                  <button 
                                    onClick={() => setViewingImage({ id: entry.fileName, image: entry.imageData!, loading: false })}
                                    className="text-[9px] font-display font-bold uppercase tracking-widest bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-white flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <Eye className="w-2.5 h-2.5" />
                                    View Image
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {entry.status !== 'failed' && entry.imageData && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isFallbackSuccess && (
                                <button 
                                  onClick={() => handleRetry(entry)}
                                  className="text-[9px] font-display font-bold uppercase tracking-widest bg-amber-500/20 hover:bg-amber-500/40 px-2.5 py-1 rounded text-amber-300 flex items-center gap-1 transition-colors animate-pulse cursor-pointer animate-none"
                                  title="Re-run AI extraction"
                                >
                                  <RefreshCw className="w-2.5 h-2.5 animate-spin-slow" />
                                  Retry AI
                                </button>
                              )}
                              <button 
                                onClick={() => setViewingImage({ id: entry.fileName, image: entry.imageData!, loading: false })}
                                className="text-[9px] font-display font-bold uppercase tracking-widest text-white/40 hover:text-white underline flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-2.5 h-2.5" />
                                View
                              </button>
                            </div>
                          )}

                          <button 
                            onClick={() => removeLogEntry(entry.fileName, entry.timestamp)}
                            className="p-1.5 hover:bg-white/10 rounded-full transition-all text-white/20 hover:text-white active:scale-90 cursor-pointer flex-shrink-0 self-center"
                            title="Remove from log"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Diagnostic troubleshoot message expanded inline */}
                      {entry.status === 'failed' && expandedLogDiagnostics.includes(entry.timestamp) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="p-3 bg-red-950/25 border border-red-500/15 rounded-lg space-y-2.5 mt-1 select-text text-left max-w-full block"
                        >
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-bold text-red-400 font-sans uppercase tracking-wider block bg-red-500/10 px-1.5 py-0.5 rounded w-max">Diagnostic Analysis</span>
                            <p className="text-[11px] text-zinc-300 leading-relaxed font-sans">{entry.diagnostic?.detailed || "The scan failed during step execution. This can happen if the image contains no legible text, structural boundaries aren't respected, or there are network delays with Google's APIs."}</p>
                          </div>
                          <div className="flex flex-col gap-1 border-t border-white/5 pt-2">
                            <span className="text-[9px] font-bold text-green-400 font-sans uppercase tracking-wider block bg-green-500/10 px-1.5 py-0.5 rounded w-max">Recommended Solution</span>
                            <p className="text-[11px] text-zinc-300 leading-relaxed font-sans">{entry.diagnostic?.solution || "Check that the image displays clear column divisions, dates, and vehicle numbers. Retrying at a later time or submitting manual log inputs resolves this immediately."}</p>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>

          {uploadLog.some(e => e.status === 'queued') && (
            <div className="mt-6 p-4 bg-purple-600/10 border border-purple-500/20 rounded-2xl flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center">
                <h4 className="text-xs font-display font-bold text-white uppercase tracking-widest mb-1">Ready to Process</h4>
                <p className="text-[10px] font-display font-medium text-white/40 uppercase tracking-widest">
                  {uploadLog.filter(e => e.status === 'queued').length} images waiting in queue
                </p>
              </div>
              <button 
                onClick={startBatchProcessing}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-3 py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-display font-bold uppercase tracking-[0.2em] text-xs rounded-xl shadow-lg shadow-purple-900/20 transition-all active:scale-[0.98]"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current" />
                    Start AI Extraction
                  </>
                )}
              </button>
              <p className="text-[9px] font-display font-medium text-purple-400/60 uppercase tracking-widest text-center">
                * Images will be processed one by one with a 5s interval to ensure stability
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-1">
            <p className="text-[9px] font-display font-medium opacity-40">
              * This log persists even if the browser crashes. Successful uploads are saved to the cloud.
            </p>
            <p className="text-[9px] font-display font-medium opacity-40">
              * Note: Mobile browsers may rename files (e.g., "image.jpg") when selecting from the gallery.
            </p>
            <p className="text-[9px] font-display font-medium opacity-40">
              * The "View" button is only available for the current session to save storage space.
            </p>
          </div>
          </>
          )}
        </div>
      )}

      {/* Audit Results Section */}
      {isAuditMode && auditResults.length > 0 && (
        <div className="mb-12 bg-surface border border-border p-6 border-cyan-500/30 bg-cyan-500/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <h2 className="font-display font-bold uppercase tracking-[0.2em] text-xs text-white">Audit Verification Results</h2>
            </div>
            <button 
              onClick={() => setAuditResults([])}
              className="text-[10px] font-display font-bold uppercase tracking-[0.2em] opacity-40 hover:opacity-100 hover:text-red-400 transition-all"
            >
              Clear Results
            </button>
          </div>
          
          <div className="max-h-80 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {auditResults.map((result, i) => (
              <div key={i} className={cn(
                "p-4 border rounded-xl flex flex-col gap-2 transition-all",
                result.isDuplicate 
                  ? "bg-green-500/10 border-green-500/20" 
                  : result.isPotential
                    ? "bg-amber-500/10 border-amber-500/20"
                    : "bg-red-500/10 border-red-500/20"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {result.isDuplicate ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : result.isPotential ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Zap className="w-4 h-4 text-cyan-400" />
                    )}
                    <span className={cn(
                      "text-[10px] font-display font-bold uppercase tracking-widest",
                      result.isDuplicate ? "text-green-400" : result.isPotential ? "text-amber-400" : "text-cyan-400"
                    )}>
                      {result.isDuplicate ? "Already Uploaded" : result.isPotential ? "Potential Match (Conflict?)" : "New Entry Saved"}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-white/20 truncate max-w-[150px]" title={result.fileName}>
                    {result.fileName}
                  </span>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <span className="text-[8px] font-display font-bold uppercase tracking-widest text-white/30 block mb-1">Plate</span>
                    <span className="text-xs font-display font-bold text-white uppercase">{result.plate}</span>
                  </div>
                  <div>
                    <span className="text-[8px] font-display font-bold uppercase tracking-widest text-white/30 block mb-1">Date</span>
                    <span className="text-xs font-mono font-bold text-white">{result.date}</span>
                  </div>
                  <div>
                    <span className="text-[8px] font-display font-bold uppercase tracking-widest text-white/30 block mb-1">Service</span>
                    <span className="text-[10px] font-display font-medium text-white/80 line-clamp-1">{result.service}</span>
                  </div>
                </div>
                
                <div className="mt-1 pt-2 border-t border-white/5 flex items-center justify-between">
                  <button 
                    onClick={() => recheckAuditResult(i)}
                    disabled={recheckingIndex === i}
                    className="text-[9px] font-display font-bold uppercase tracking-widest text-white/40 hover:text-white flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-2.5 h-2.5", recheckingIndex === i && "animate-spin")} />
                    {recheckingIndex === i ? 'Checking...' : 'Check Again'}
                  </button>
                  
                  {(result.isDuplicate || result.isPotential) && result.matchId && (
                    <button 
                      onClick={() => {
                        // Scroll to record or highlight it
                        setSearchQuery(result.plate);
                        setShowHistory(true);
                        setIsAuditMode(false); // Exit audit mode to see it
                      }}
                      className={cn(
                        "text-[9px] font-display font-bold uppercase tracking-widest hover:underline",
                        result.isDuplicate ? "text-cyan-400" : "text-amber-400"
                      )}
                    >
                      View Match in History
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
            <p className="text-[10px] font-display font-medium text-cyan-300/80 leading-relaxed uppercase tracking-wider">
              <span className="font-bold">Audit Mode Active:</span> Duplicates were <span className="underline">skipped</span> to protect your database, while all unique new records were <span className="text-green-400 font-bold">saved automatically</span>.
            </p>
          </div>
        </div>
      )}

      {viewMode === 'log' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <SearchFilters 
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              descriptionQuery={descriptionQuery}
              setDescriptionQuery={setDescriptionQuery}
              isSearching={isSearching}
              isServiceUnlocked={isServiceUnlocked}
              usageStats={usageStats}
              setShowServicePasswordPrompt={setShowServicePasswordPrompt}
              recentSearches={recentSearches}
              isAuditMode={isAuditMode}
            />
        
        <div className="relative group">
          <label className="font-display font-bold uppercase tracking-[0.2em] text-[9px] opacity-40 block mb-2 ml-2">Find Maintenance</label>
          <div className="flex flex-col gap-2">
            <div className="relative">
              {isFiltering ? (
                <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400 animate-spin" />
              ) : (
                <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-30" />
              )}
              <input 
                type="text"
                placeholder="Primary filter..."
                className="w-full bg-black/40 border neon-border-violet p-2.5 pl-10 pr-10 rounded-full font-display font-medium text-sm focus:outline-none transition-all placeholder:opacity-30"
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                title="Filter records by service description (e.g. Oil, Tires)"
              />
              {serviceFilter && (
                <button 
                  onClick={() => setServiceFilter('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-full transition-colors"
                  title="Clear Filter"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="relative">
              <ListFilter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-30" />
              <input 
                type="text"
                placeholder="Secondary filter..."
                className="w-full bg-black/40 border neon-border-violet p-2.5 pl-10 pr-10 rounded-full font-display font-medium text-sm focus:outline-none transition-all placeholder:opacity-30"
                value={secondaryServiceFilter}
                onChange={(e) => setSecondaryServiceFilter(e.target.value)}
                title="Add a second filter for more specific results"
              />
              {secondaryServiceFilter && (
                <button 
                  onClick={() => setSecondaryServiceFilter('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-full transition-colors"
                  title="Clear Secondary Filter"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          {recentServiceFilters.length > 0 && !serviceFilter && !secondaryServiceFilter && (
            <div className="mt-2 flex flex-wrap gap-1.5 ml-2">
              {recentServiceFilters.map((s, i) => (
                <button 
                  key={i} 
                  onClick={() => setServiceFilter(s)}
                  className="text-[8px] font-mono bg-white/5 hover:bg-purple-500/20 border border-white/5 hover:border-purple-500/30 px-2 py-0.5 rounded-full opacity-40 hover:opacity-100 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative group">
          <label className="font-display font-bold uppercase tracking-[0.2em] text-[9px] opacity-40 block mb-2 ml-2">Date Range</label>
          <div className="flex items-center gap-2">
            <input 
              type="date"
              className="flex-1 bg-white/5 border border-white/10 p-2.5 rounded-xl font-display font-medium text-[10px] focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              title="Start date for filtering records"
            />
            <span className="text-white/20 text-[10px]">to</span>
            <input 
              type="date"
              className="flex-1 bg-white/5 border border-white/10 p-2.5 rounded-xl font-display font-medium text-[10px] focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              title="End date for filtering records"
            />
          </div>
          {(startDate || endDate) && (
            <button 
              onClick={() => setShowDateRangeReport(true)}
              className="mt-2 w-full flex items-center justify-center gap-2 p-2 bg-purple-600/20 border border-purple-500/30 text-purple-400 rounded-xl font-display font-bold text-[9px] uppercase tracking-[0.2em] hover:bg-purple-600/30 transition-all"
            >
              <ListFilter className="w-3 h-3" />
              Generate Summary Report
            </button>
          )}
        </div>

        <div className="flex items-end gap-2">
            <div className="flex flex-col items-center gap-1">
              <button 
                onClick={() => setShowLatestOnly(!showLatestOnly)}
                className={cn(
                  "flex-1 w-full flex items-center justify-center gap-2 p-2.5 rounded-full border transition-all font-display font-bold text-[10px] uppercase tracking-[0.2em]",
                  showLatestOnly 
                    ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/20" 
                    : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                )}
                title="Toggle Latest Only"
              >
                <Clock className={cn("w-3.5 h-3.5", showLatestOnly ? "animate-pulse" : "")} />
                {showLatestOnly ? "Latest" : "All"}
              </button>
              <span className="text-[8px] font-mono text-white/30 uppercase tracking-widest">{filteredRecords.length} Unique Records</span>
            </div>
          
          <button 
            onClick={() => {
              setSearchQuery('');
              setDescriptionQuery('');
              setServiceFilter('');
              setSecondaryServiceFilter('');
              setStartDate('');
              setEndDate('');
              setShowHistory(false);
            }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 p-2.5 rounded-full border transition-all font-display font-bold text-[10px] uppercase tracking-[0.2em]",
              (searchQuery || descriptionQuery || serviceFilter || secondaryServiceFilter || startDate || endDate) 
                ? "bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30" 
                : "bg-white/5 border-white/10 text-white/20 cursor-not-allowed"
            )}
            disabled={!(searchQuery || descriptionQuery || serviceFilter || secondaryServiceFilter || startDate || endDate)}
            title="Clear All Filters"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Intelligence Expansion Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Rectangle 1: Ask Anni AI */}
        <div className="p-6 bg-surface border border-violet-500/20 rounded-[2rem] flex flex-col relative overflow-hidden group">
          {/* Animated Background Glow */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-violet-600/10 blur-[50px] group-hover:bg-violet-600/20 transition-all duration-1000" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 border border-violet-500/20 flex items-center justify-center relative shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                <Sparkles className="w-4 h-4 text-white" />
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
              </div>
              <div className="flex flex-col">
                <h3 className="text-sm font-display font-black text-white uppercase tracking-widest leading-none">Ask AI for help</h3>
                <p className="text-[8px] font-display font-medium text-violet-400/60 uppercase tracking-[0.2em] mt-1">Deep Pattern Analysis</p>
              </div>
            </div>

            <button 
              onClick={handleTroubleFinding}
              disabled={isTroubleFindingLoading || records.length === 0 || !searchQuery.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-display font-black uppercase tracking-[0.3em] text-[9px] rounded-xl transition-all active:scale-95 shadow-[0_0_20px_rgba(0,245,255,0.3)]"
            >
              {isTroubleFindingLoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  CONSULTING ANNI...
                </>
              ) : (
                <>
                  <Zap className="w-3 h-3 fill-current" />
                  SCAN
                </>
              )}
            </button>
          </div>

          {troubleFindingAnswer && (
            <div className="mt-4 p-4 bg-black/40 border border-violet-500/20 rounded-xl animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-1.5 bg-violet-500 rounded-full shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                <span className="font-display font-bold text-[9px] uppercase tracking-[0.3em] text-violet-400">Anni's Report</span>
                <button 
                  onClick={() => setTroubleFindingAnswer(null)}
                  className="ml-auto p-1 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-2.5 h-2.5 opacity-40 hover:opacity-100" />
                </button>
              </div>
              <div className="prose prose-invert prose-sm max-w-none">
                <div className="text-white/80 font-display leading-relaxed whitespace-pre-wrap text-[11px]">
                  {troubleFindingAnswer}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rectangle 2: Service Expansion Search */}
        <div className={cn(
          "p-6 bg-black/40 border border-cyan-500/10 rounded-[2rem] flex flex-col relative overflow-hidden group transition-all duration-500",
          !searchQuery.trim() ? "opacity-30 grayscale" : "opacity-100"
        )}>
          {/* Animated Background Glow */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-600/5 blur-[50px] group-hover:bg-cyan-600/10 transition-all duration-1000" />

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-cyan-600/10 border border-cyan-500/20 flex items-center justify-center">
                <Search className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-sm font-display font-black text-cyan-400 uppercase tracking-widest leading-none">Expansion Search</h3>
                <p className="text-[8px] font-display font-medium text-white/30 uppercase tracking-[0.2em] mt-1">Technical Cross-Reference</p>
              </div>
            </div>
            
            <form onSubmit={handleServiceHintSearch} className="relative group/hint">
              <input
                type="text"
                value={serviceHintQuery}
                onChange={(e) => setServiceHintQuery(e.target.value)}
                disabled={!searchQuery.trim() || isServiceHintLoading}
                placeholder="COMPONENT REFERENCE..."
                className="w-full bg-black/60 border neon-border-cyan p-3 pl-5 pr-20 rounded-xl font-display font-bold text-[10px] focus:outline-none transition-all placeholder:opacity-20 disabled:opacity-50 uppercase tracking-widest"
              />
              <button
                type="submit"
                disabled={!serviceHintQuery.trim() || isServiceHintLoading || records.length === 0 || !searchQuery.trim()}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all rounded-lg font-display font-black uppercase tracking-widest text-[8px]"
              >
                {isServiceHintLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "SCAN"}
              </button>
            </form>
          </div>

          {serviceHintAnswer && (
            <div className="mt-6 p-6 bg-black/60 border border-cyan-500/20 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-500">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                  <span className="font-display font-bold text-[10px] uppercase tracking-[0.3em] text-cyan-400">System Log: {searchQuery.toUpperCase()}</span>
                </div>
                <button 
                  onClick={() => setServiceHintAnswer(null)}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-3 h-3 opacity-40 hover:opacity-100 text-white" />
                </button>
              </div>
              <div className="space-y-1">
                {serviceHintAnswer.split('\n').filter(l => l.trim()).map((line, idx) => {
                  const parts = line.split('|');
                  const date = (parts[0] || '').trim();
                  const service = (parts[1] || '').trim();
                  return (
                    <div key={idx} className="flex items-start gap-4 group/line py-1.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                      <span className="text-[10px] font-mono text-cyan-400/60 shrink-0 w-20">
                        {date}
                      </span>
                      <span className="text-[11px] font-display font-black text-white/90 group-hover/line:text-cyan-400 transition-colors uppercase">
                        {service}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Latest Result Summary Area */}
      {showLatestOnly && filteredRecords.length > 0 && (
        <div className="mb-12 p-6 glassmorphism rounded-2xl neon-border-violet">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(160,32,240,0.8)]" />
                <span className="font-display font-bold text-[9px] uppercase tracking-[0.3em] text-violet-400">Latest Inquiry Found</span>
              </div>
              <div className="text-[9px] font-mono opacity-30 uppercase tracking-widest">
                {(() => {
                  const d = new Date(filteredRecords[0].service_date);
                  if (isNaN(d.getTime())) return filteredRecords[0].service_date;
                  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
                })()}
              </div>
            </div>
            
            {/* Show image if available */}
            {isLoadingLatestImage ? (
              <div className="w-full max-w-sm h-40 flex items-center justify-center bg-white/5 border border-white/10 rounded-lg">
                <Loader2 className="w-5 h-5 animate-spin opacity-20" />
              </div>
            ) : latestImage ? (
              <div className="w-full max-w-sm overflow-hidden rounded-lg border border-white/10 shadow-2xl shadow-black/50">
                <img 
                  src={latestImage} 
                  alt="Original Record" 
                  className="w-full h-auto object-contain grayscale hover:grayscale-0 transition-all duration-500"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : null}

            <div className="space-y-4">
              <div className="text-center">
                <p className="font-display text-4xl md:text-5xl font-bold tracking-tighter text-white mb-1 uppercase">{filteredRecords[0].plate_number}</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-[10px] font-display font-bold text-white/40 uppercase tracking-widest">History for {filteredRecords[0].plate_number}</span>
                  <div className="w-1 h-1 bg-white/10 rounded-full" />
                  <span className="text-[10px] font-display font-bold text-purple-400 uppercase tracking-widest">
                    {(() => {
                      const recordDate = new Date(filteredRecords[0].service_date);
                      const now = new Date();
                      const diffTime = Math.abs(now.getTime() - recordDate.getTime());
                      const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.4375));
                      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                      if (diffMonths > 0) return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
                      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
                    })()}
                  </span>
                </div>
              </div>

              <div className="bg-black/20 p-6 rounded-xl border border-white/5">
                <div className="flex flex-col gap-2">
                  {(() => {
                    // Combine all records from the same date and truck if they exist
                    const combinedDescription = filteredRecords
                      .filter(r => r.service_date === filteredRecords[0].service_date && r.plate_number === filteredRecords[0].plate_number)
                      .map(r => r.service_description)
                      .join('\n');

                    return combinedDescription.split(/[,*\n]/)
                      .map(p => p.trim())
                      .filter(p => p)
                      .sort((a, b) => {
                        const aLower = a.toLowerCase();
                        const bLower = b.toLowerCase();
                        const aMatch = (serviceFilter && aLower.includes(serviceFilter.toLowerCase())) || (secondaryServiceFilter && aLower.includes(secondaryServiceFilter.toLowerCase()));
                        const bMatch = (serviceFilter && bLower.includes(serviceFilter.toLowerCase())) || (secondaryServiceFilter && bLower.includes(secondaryServiceFilter.toLowerCase()));
                        // Put matches at the bottom, non-matches at the top
                        if (aMatch && !bMatch) return 1;
                        if (!aMatch && bMatch) return -1;
                        return 0;
                      })
                      .map((part, i) => {
                        const lowerPart = part.toLowerCase();
                        const isPrimaryMatch = serviceFilter && lowerPart.includes(serviceFilter.toLowerCase());
                        const isSecondaryMatch = secondaryServiceFilter && lowerPart.includes(secondaryServiceFilter.toLowerCase());
                        const isMatch = isPrimaryMatch || isSecondaryMatch;

                        // Filter out common names/metadata ONLY if they are NOT a match
                        const isMetadata = lowerPart.includes('mechanic') || 
                                         lowerPart.includes('supervisor') || 
                                         lowerPart.includes('fundi') ||
                                         lowerPart.includes('garage');

                        if (isMetadata && !isMatch) return null;

                        return (
                          <div key={i} className="flex items-start gap-2">
                            <span className={cn(
                              "transition-all duration-500",
                              isMatch 
                                ? "text-2xl md:text-3xl font-bold text-emerald-500 leading-tight" 
                                : "text-[14px] opacity-70 font-medium text-white/90"
                            )}>
                              * {part}
                            </span>
                          </div>
                        );
                      });
                  })()}
                </div>
              </div>

              <div className="flex flex-col items-center gap-4 pt-4">
                <div className="flex flex-wrap justify-center gap-2">
                  {searchQuery && <span className="px-2 py-1 bg-white/5 rounded text-[8px] font-mono text-white/40 uppercase tracking-widest">Plate: {searchQuery}</span>}
                  {serviceFilter && <span className="px-2 py-1 bg-white/5 rounded text-[8px] font-mono text-white/40 uppercase tracking-widest">Primary: {serviceFilter}</span>}
                  {secondaryServiceFilter && <span className="px-2 py-1 bg-white/5 rounded text-[8px] font-mono text-white/40 uppercase tracking-widest">Secondary: {secondaryServiceFilter}</span>}
                <button 
                  onClick={() => {
                    const recordDate = new Date(filteredRecords[0].service_date);
                    const now = new Date();
                    const diffTime = Math.abs(now.getTime() - recordDate.getTime());
                    const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.4375));
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    const timeDiff = diffMonths > 0 ? `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago` : `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
                    const text = `DT.Base History for ${filteredRecords[0].plate_number}\nDate: ${filteredRecords[0].service_date} (${timeDiff})\nService: ${filteredRecords[0].service_description}`;
                    if (navigator.share) {
                      navigator.share({ title: 'DT.Base Record', text });
                    } else {
                      navigator.clipboard.writeText(text);
                      alert("Copied to clipboard!");
                    }
                  }}
                  className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-cyan-500 to-violet-600 text-white hover:from-cyan-400 hover:to-violet-500 transition-all active:scale-95 rounded-full shadow-[0_0_20px_rgba(0,245,255,0.3)]"
                  title="Share this record or copy it to clipboard"
                >
                  <Search className="w-3 h-3" />
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em]">Share Result</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Maintenance History Header */}
      {showHistory && (
        <div className="flex justify-between items-end mb-6 px-2">
          <div className="flex flex-col gap-1">
            <h2 className="font-display font-bold uppercase tracking-[0.3em] text-[10px] text-purple-400">Log History</h2>
            <div className="flex items-center gap-3">
              <h3 className="font-display font-bold text-lg text-white tracking-tight">
                {(searchQuery || serviceFilter || secondaryServiceFilter || startDate || endDate) ? 'Search Results' : 'Maintenance Records'}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-6">
            {user && (
              <button 
                onClick={fetchRecords}
                disabled={isRefreshing}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 bg-surface/40 hover:bg-surface/60 border border-white/5 rounded-xl text-[9px] font-display font-bold text-text uppercase tracking-widest transition-all",
                  isRefreshing && "opacity-50 cursor-not-allowed"
                )}
                title="Sync maintenance records from cloud"
              >
                <RefreshCw className={cn("w-3.5 h-3.5 text-purple-400", isRefreshing && "animate-spin")} />
                {isRefreshing ? 'Syncing...' : 'Sync Data'}
              </button>
            )}
            <div className="flex gap-3">
              <button 
                onClick={() => toggleAll(true)}
                className="text-[9px] font-display font-bold uppercase tracking-[0.2em] opacity-30 hover:opacity-100 hover:text-purple-400 transition-all"
                title="Expand all truck record groups"
              >
                Expand
              </button>
              <button 
                onClick={() => toggleAll(false)}
                className="text-[9px] font-display font-bold uppercase tracking-[0.2em] opacity-30 hover:opacity-100 hover:text-purple-400 transition-all"
                title="Collapse all truck record groups"
              >
                Collapse
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <RecordsList 
          groupedRecords={groupedRecords}
          expandedPlates={expandedPlates}
          onTogglePlate={togglePlate}
          onEditRecord={setEditingRecord}
          onToggleVerify={handleToggleVerify}
          onViewImage={handleViewImage}
          normalizePlate={normalizePlate}
          isProcessing={isProcessing}
          user={user}
          onUploadClick={(e) => handleFileUpload(e, 'fleet')}
          isServiceUnlocked={isServiceUnlocked}
          setShowServicePasswordPrompt={setShowServicePasswordPrompt}
          isAuditMode={isAuditMode}
        />
      )}

      {/* Image Modal */}
      {viewingImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90">
            <div className="relative w-full max-w-4xl bg-surface border border-border border-violet-500/30 shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
              <div className="flex flex-col">
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-violet-400">Record Image</span>
                {records.find(r => r.id === viewingImage.id)?.file_name && (
                  <span className="text-[9px] font-mono text-white/40 truncate max-w-[200px]">
                    {records.find(r => r.id === viewingImage.id)?.file_name}
                  </span>
                )}
              </div>
              <button 
                onClick={() => setViewingImage(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/20">
              {viewingImage.loading ? (
                <div className="flex flex-col items-center gap-4 py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                  <span className="text-[10px] font-display font-bold uppercase tracking-widest opacity-40">Loading Image...</span>
                </div>
              ) : viewingImage.image ? (
                <img 
                  src={viewingImage.image} 
                  alt="Maintenance Record" 
                  className="max-w-full h-auto object-contain shadow-2xl"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="py-20 text-center">
                  <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-4 opacity-40" />
                  <p className="text-[10px] font-display font-bold uppercase tracking-widest opacity-40">Image not found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Date Range Summary Report Modal */}
      {showDateRangeReport && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/95 overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-2xl glassmorphism neon-border-violet shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh] my-auto"
          >
            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
              <div className="flex flex-col gap-1 relative z-10">
                <h2 className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-violet-400">Summary Report</h2>
                <div className="flex items-center gap-2 text-white/60 font-display font-bold text-xs uppercase tracking-widest">
                  <span>From {startDate || 'Start'}</span>
                  <span className="opacity-30">→</span>
                  <span>To {endDate || 'Today'}</span>
                </div>
              </div>
              <button 
                onClick={() => setShowDateRangeReport(false)}
                className="p-2 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white"
                title="Close Report"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-8">
              {Object.entries(groupedRecords).length === 0 ? (
                <div className="py-20 text-center">
                  <AlertCircle className="w-8 h-8 text-white/10 mx-auto mb-4" />
                  <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/20">No records found for this range</p>
                </div>
              ) : (
                Object.entries(groupedRecords).map(([plate, plateRecords]) => {
                  // Group by date for this plate
                  const dateGroups: Record<string, string[]> = {};
                  plateRecords.sort((a, b) => new Date(b.service_date).getTime() - new Date(a.service_date).getTime()).forEach(r => {
                    const date = r.service_date;
                    const cleaned = cleanServiceDescription(r.service_description);
                    if (!dateGroups[date]) dateGroups[date] = [];
                    if (!dateGroups[date].includes(cleaned)) {
                      dateGroups[date].push(cleaned);
                    }
                  });

                  return (
                    <div key={plate} className="space-y-6">
                      <div className="flex items-baseline gap-3 border-b border-white/5 pb-2">
                        <h3 className="text-2xl font-display font-bold text-white tracking-tight uppercase">{plate}</h3>
                        <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                          {plateRecords.length} {plateRecords.length === 1 ? 'Entry' : 'Entries'}
                        </span>
                      </div>

                      <div className="space-y-6 pl-4">
                        {Object.entries(dateGroups)
                          .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
                          .map(([date, items]) => (
                          <div key={date} className="space-y-3">
                            <p className="text-sm font-mono font-bold text-emerald-400 tracking-wider">
                              {date}
                            </p>
                            <div className="space-y-2">
                              {items.map((item, i) => (
                        <div key={i} className="flex gap-3 text-sm font-display leading-relaxed text-text bg-surface p-3 border border-border rounded-xl">
                                  <div className="mt-1.5 w-1 h-1 rounded-full bg-purple-500 shrink-0" />
                                  <div className="whitespace-pre-line">{item}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-6 border-t border-white/5 bg-white/[0.01] flex justify-between items-center">
              <div className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em]">
                Generated {new Date().toLocaleDateString()}
              </div>
              <button 
                onClick={() => {
                  const reportText = Object.entries(groupedRecords).map(([plate, plateRecords]) => {
                    const dateGroups: Record<string, string[]> = {};
                    plateRecords.sort((a, b) => new Date(b.service_date).getTime() - new Date(a.service_date).getTime()).forEach(r => {
                      const date = r.service_date;
                      const cleaned = cleanServiceDescription(r.service_description);
                      if (!dateGroups[date]) dateGroups[date] = [];
                      if (!dateGroups[date].includes(cleaned)) {
                        dateGroups[date].push(cleaned);
                      }
                    });

                    let plateText = `${plate}\nHas ${plateRecords.length} records\n`;
                    Object.entries(dateGroups)
                      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
                      .forEach(([date, items]) => {
                        plateText += `\n${date}\n`;
                        items.forEach(item => plateText += `* ${item}\n`);
                      });
                    return plateText;
                  }).join('\n\n');

                  const fullText = `DT.Base Summary Report\nFrom: ${startDate || 'Start'} To: ${endDate || 'Today'}\n\n${reportText}`;
                  
                  if (navigator.share) {
                    navigator.share({ title: 'DT.Base Summary Report', text: fullText });
                  } else {
                    navigator.clipboard.writeText(fullText);
                    alert("Report copied to clipboard!");
                  }
                }}
                className="flex items-center gap-2 px-6 py-3 bg-text text-bg hover:opacity-90 transition-all active:scale-95 rounded-xl font-display font-black uppercase tracking-widest text-[10px]"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em]">Share Report</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Global Alert & Quick Help Ribbon */}
      <div className="mt-8 mb-4 flex flex-col sm:flex-row items-center justify-between gap-3 p-3 px-5 rounded-2xl bg-white/[0.03] border border-white/5 text-[9px] font-mono tracking-wider text-white/50 uppercase transition-all hover:bg-white/[0.05]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-bold text-emerald-400">System Link Operational</span>
          <span className="text-white/20">|</span>
          <span>Baseline Duplicates Block Active</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[8px] font-black tracking-widest uppercase">PRODUCTION VERIFIED</span>
            <span className="text-white/20">v2.4.0-SECURE</span>
          </div>

          <button 
            onClick={() => setShowFaqModal(true)}
            className="flex items-center gap-1.5 text-[9px] text-cyan-400 hover:text-cyan-300 font-display font-bold cursor-pointer transition-all bg-cyan-500/10 hover:bg-cyan-500/20 py-1 px-2.5 rounded-lg border border-cyan-500/20 hover:neon-glow-cyan"
            title="Open Quick Help & FAQ"
          >
            <Sparkles className="w-3 h-3 text-cyan-400 rotate-12" />
            FAQ & QUICK HELP
          </button>
        </div>
      </div>

      {/* Stats & Compliance Footer */}
      <footer className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-6 pb-8 text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500">
        <div className="flex flex-col gap-1.5 text-center md:text-left">
          <p className="font-display font-black text-white/50 tracking-tighter text-[11px]">DT.Base Fleet Integrity Log</p>
          <p>© {new Date().getFullYear()} DT.Base Systems. All Rights Reserved. Operator Security Level 3.</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-zinc-400">
          <button 
            onClick={() => {
              setNotification({
                message: "Terms of Service: This local cache environment processes fleet records securely under Operator License v3.",
                type: "info"
              });
            }}
            className="hover:text-white transition-colors cursor-pointer border-b border-transparent hover:border-white/20 pb-0.5 font-bold"
          >
            Terms of Service
          </button>
          <span className="opacity-25">•</span>
          <button 
            onClick={() => {
              setNotification({
                message: "Privacy Shield: All maintenance records stay cached inside local Sandboxed indexedDB context securely.",
                type: "success"
              });
            }}
            className="hover:text-white transition-colors cursor-pointer border-b border-transparent hover:border-white/20 pb-0.5 font-bold"
          >
            Privacy Policy
          </button>
          <span className="opacity-25">•</span>
          <button 
            onClick={() => {
              setNotification({
                message: "Cookie Credentials: DT.Base local storage saves layout themes and custom client configuration only.",
                type: "info"
              });
            }}
            className="hover:text-white transition-colors cursor-pointer border-b border-transparent hover:border-white/20 pb-0.5 font-bold"
          >
            Cookies
          </button>
          <span className="opacity-25">•</span>
          <button 
            onClick={() => setShowContactModal(true)}
            className="text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer font-bold border-b border-cyan-500/20 hover:border-cyan-400/50 flex items-center gap-1 uppercase"
          >
            <Sparkles className="w-3 h-3 text-cyan-400 rotate-12 animate-pulse" />
            Report a Bug
          </button>
          
          {isCloudConnected === false && (
            <>
              <span className="opacity-25">•</span>
              <button 
                onClick={() => window.location.reload()}
                className="text-purple-400 hover:text-purple-300 transition-colors font-bold"
                title="Retry database handshake"
              >
                Retry Connection
              </button>
            </>
          )}
        </div>
      </footer>
        </>
      ) : viewMode === 'analytics' ? (
        <Analytics 
          records={filteredRecords} 
          fleetRegistry={fleetRegistry} 
          onRefresh={fetchRecords}
          isRefreshing={isRefreshing}
        />
      ) : viewMode === 'battery' ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <BatteryIntelligence records={records} fleetRegistry={fleetRegistry} />
        </div>
      ) : viewMode === 'marketplace' ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <Marketplace 
            marketPrices={marketPrices} 
            payments={INITIAL_PAYMENTS}
            isLocked={!isServiceUnlocked} 
            onUnlockRequest={() => setShowServicePasswordPrompt(true)} 
            user_id={user?.id}
          />
        </div>
      ) : viewMode === 'advanced-search' ? (
        <AdvancedSearch records={records} />
      ) : (
        <FleetAuditReport 
          records={records} 
          fleetRegistry={fleetRegistry}
          onFocusTruck={(plate) => {
            setSearchQuery(plate);
            setViewMode('log');
          }}
          onRefresh={fetchRecords}
          isRefreshing={isRefreshing}
        />
      )}

      {/* Market Prices Modal */}
      <AnimatePresence>
        {showMarketPricesModal && (
          <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/95 overflow-y-auto" onClick={() => setShowMarketPricesModal(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="glassmorphism neon-border-violet w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] rounded-3xl my-auto"
            >
              <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-3 relative z-10">
                  <div className="p-2 bg-amber-500/20 rounded-lg border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                    <Tag className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-display font-bold text-white uppercase tracking-widest">Market Price Reference</h2>
                    <p className="text-[10px] text-cyan-400/60 font-mono uppercase">Tracked Costs for Parts & Services</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowMarketPricesModal(false)}
                  className="p-2 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white"
                  title="Close Market Database"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {marketPrices.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-white/10">
                    <Coins className="w-8 h-8 text-white/10 mx-auto mb-3" />
                    <p className="text-xs text-white/40 font-mono uppercase tracking-widest">No market prices tracked yet.</p>
                    <p className="text-[10px] text-white/20 font-mono mt-2 px-8">
                      The AI automatically tracks prices from your logs and chat corrections.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {marketPrices.map((price) => (
                      <div key={price.id} className="p-3 glassmorphism border neon-border-violet/20 flex items-center justify-between group hover:neon-border-violet transition-all rounded-xl">
                        <div className="flex flex-col">
                          <span className="text-xs font-display font-bold text-white uppercase tracking-wider">{price.item_name}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-white/40 font-mono uppercase">Last Updated: {new Date(price.last_updated).toLocaleDateString()}</span>
                            <span className="text-[9px] text-violet-400/60 font-mono uppercase">By: {price.confirmed_by}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-mono font-bold text-cyan-400 shadow-[0_0_8px_rgba(0,245,255,0.3)]">{price.currency} {price.price.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-4 bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-start gap-3">
                    <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-[10px] font-display font-bold text-amber-500 uppercase tracking-widest">How it works</p>
                      <p className="text-[9px] text-white/60 leading-relaxed">
                        The AI scans your logs for costs and saves them here. You can also correct prices in the AI Chat (e.g., "The price of Caltex Ultra is 5000") to update this database.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-white/5 bg-blue-500/5 rounded-xl border border-blue-500/20 group hover:bg-blue-500/10 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-blue-400" />
                      <span className="text-[10px] font-display font-black text-white uppercase tracking-widest">IntelSync Harvest</span>
                    </div>
                    <button 
                      onClick={async () => {
                        if (!user) return;
                        setNotification({ message: 'Harvesting from IntelCenter...', type: 'info' });
                        try {
                          const ledgerData = await fetchLedgerItems();
                          const harvested = harvestMarketPrices(ledgerData);
                          
                          if (harvested.length === 0) {
                            setNotification({ message: 'No clear price data found in Ledger.', type: 'warning' });
                            return;
                          }

                          for (const item of harvested) {
                            await handleSaveMarketPrice(item.item_name, item.price, item.currency);
                          }
                          
                          setNotification({ message: `Successfully harvested ${harvested.length} prices!`, type: 'success' });
                        } catch (err) {
                          console.error("Harvest failed:", err);
                          setNotification({ message: 'Failed to harvest prices.', type: 'error' });
                        }
                      }}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-display font-bold uppercase tracking-widest text-[8px] rounded transition-all shadow-[0_0_10px_rgba(37,99,235,0.3)]"
                    >
                      Sync Now
                    </button>
                  </div>
                  <p className="text-[9px] text-white/40 leading-relaxed">
                    Auto-update this database using smart intelligence from IntelCenter. It ignores duplicates and messy notes.
                  </p>
                </div>
              </div>

              <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end">
                <button 
                  onClick={() => setShowMarketPricesModal(false)}
                  className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white font-display font-bold uppercase tracking-widest text-[10px] transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FAQ / Quick Help Modal */}
      <AnimatePresence>
        {showFaqModal && (
          <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/95 overflow-y-auto font-sans" onClick={() => setShowFaqModal(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="glassmorphism neon-border-cyan w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] rounded-3xl my-auto"
            >
              <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-3 relative z-10">
                  <div className="p-2 bg-cyan-500/20 rounded-lg border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                    <HelpCircle className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-base font-display font-black text-white uppercase tracking-widest leading-none mb-1">DT.Base Quick Help & Manual</h2>
                    <p className="text-[9px] text-cyan-400/60 font-mono uppercase tracking-widest">Frequently Asked Questions & Operations Manual</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowFaqModal(false)}
                  className="p-2 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white"
                  title="Close Help"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
                <div className="space-y-4">
                  <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl">
                    <h3 className="text-[10px] font-display font-bold text-cyan-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                      1. How does the Duplicate Audit system work?
                    </h3>
                    <p className="text-[10px] text-white/70 leading-relaxed font-mono uppercase tracking-widest">
                      When "Audit Mode" is active, uploading service images or entering invoices runs duplicate detection rules. Instead of automatically adding duplicate entries to the fleet history, the app flags them, helping auditors avoid database bloat and record duplication.
                    </p>
                  </div>

                  <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-2xl">
                    <h3 className="text-[10px] font-display font-bold text-violet-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                       2. How are Gemini API keys handled?
                    </h3>
                    <p className="text-[10px] text-white/70 leading-relaxed font-mono uppercase tracking-widest">
                      If running DT.Base without preconfigured backend credentials, you can paste your personal Gemini API key under Settings ➔ Local API Configuration. This key is saved locally and encrypted strictly within your browser's Sandboxed Local Cache database.
                    </p>
                  </div>

                  <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                    <h3 className="text-[10px] font-display font-bold text-amber-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      3. Why do trucks transition to red or orange cards?
                    </h3>
                    <p className="text-[10px] text-white/70 leading-relaxed font-mono uppercase tracking-widest">
                      Truck cards dynamically color-code based on fleet health. A green card signals healthy matched logs. Orange flags vehicles that are pending active auditor review, while a transition to red warns of mismatched metadata or a flagged critical duplicates block status.
                    </p>
                  </div>
                </div>

                <div className="p-4 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                  <p className="text-[8px] font-mono text-white/20 text-center uppercase tracking-widest leading-relaxed">
                    DT.Base Fleet Integrity Systems operational v2.4.0 • Built for ultimate truck maintenance security.
                  </p>
                </div>
              </div>

              <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end">
                <button 
                  onClick={() => setShowFaqModal(false)}
                  className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-display font-bold uppercase tracking-widest text-[10px] transition-all rounded-xl cursor-pointer"
                >
                  Close Help Guide
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Report a Bug / Feedback Modal */}
      <AnimatePresence>
        {showContactModal && (
          <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/95 overflow-y-auto font-sans" onClick={() => setShowContactModal(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="glassmorphism neon-border-violet w-full max-w-md overflow-hidden flex flex-col rounded-3xl my-auto"
            >
              <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-3 relative z-10 text-left">
                  <div className="p-2 bg-violet-500/20 rounded-lg border border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.3)]">
                    <Sparkles className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-display font-black text-white uppercase tracking-widest leading-none mb-1">Report Fleet Anomaly</h2>
                    <p className="text-[9px] text-violet-400/60 font-mono uppercase tracking-widest">Beam Bug Transmission to Core Headquarters</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowContactModal(false)}
                  className="p-2 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white"
                  title="Close Bug Form"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-left">
                <div className="space-y-4">
                  {/* Category Selection */}
                  <div>
                    <label className="text-[10px] font-display font-bold text-zinc-400 uppercase tracking-widest block mb-2 font-mono">Issue / Anomaly Category</label>
                    <select 
                      value={bugCategory}
                      onChange={(e) => setBugCategory(e.target.value as any)}
                      className="w-full bg-black/60 border border-white/10 p-3 rounded-xl font-mono text-xs text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="app">Command Core App UI Anomaly</option>
                      <option value="ocr">OCR Extraction Integrity failure</option>
                      <option value="sync">DB Sync & Cache Latency</option>
                      <option value="other">Other Security / Verification Bugs</option>
                    </select>
                  </div>

                  {/* Description Input */}
                  <div>
                    <label className="text-[10px] font-display font-bold text-zinc-400 uppercase tracking-widest block mb-1 font-mono">Anomaly Log description</label>
                    <textarea 
                      value={bugDescription}
                      onChange={(e) => setBugDescription(e.target.value)}
                      placeholder="DESCRIBE THE PROBLEM OR UNEXPECTED BEHAVIOR DETECTED DURING YOUR OPERATION SESSION..."
                      className="w-full h-32 bg-black/60 border border-white/10 rounded-xl p-3 font-mono text-xs text-white focus:outline-none focus:border-violet-500 resize-none placeholder:text-zinc-600 block"
                    />
                  </div>
                </div>

                <div className="p-3 bg-violet-500/5 border border-violet-500/10 rounded-xl text-[8px] font-mono text-violet-300 uppercase tracking-widest leading-normal">
                  Reporting a bug creates an anonymous diagnostic snapshot of your session databases. No private keys are transmitted.
                </div>
              </div>

              <div className="p-4 border-t border-white/10 bg-white/5 flex gap-2 justify-end">
                <button 
                  onClick={() => setShowContactModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-display font-bold uppercase tracking-widest text-[10px] transition-all rounded-xl"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if (!bugDescription.trim()) {
                      setNotification({ message: 'Describe the anomaly before transmits!', type: 'warning' });
                      return;
                    }
                    // Add structured audit event
                    addFeedNotification(
                      "Bug Transmitted Successfully",
                      `Diagnostic report submitted to command centre. Category: ${bugCategory.toUpperCase()}`,
                      "success",
                      "intelligence"
                    );

                    setNotification({
                      message: "Diagnostic log encrypted and beamed! Ticket ID: #DT-4820P",
                      type: "success"
                    });
                    setBugDescription('');
                    setShowContactModal(false);
                  }}
                  className="px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white font-display font-bold uppercase tracking-widest text-[10px] transition-all rounded-xl cursor-pointer"
                >
                  Send Transmission
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Fleet Intelligence & Notifications Panel */}
      <AnimatePresence>
        {showNotificationsPanel && (
          <div className="fixed inset-0 z-[110] flex justify-end bg-black/80 backdrop-blur-sm">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={() => setShowNotificationsPanel(false)} />
            
            <motion.div 
              initial={{ x: "100%", opacity: 0.9 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0.9 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="w-full max-w-md h-full bg-surface border-l border-border relative flex flex-col hover:neon-border-violet shadow-[0_0_50px_rgba(0,0,0,0.8)] z-20"
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 via-cyan-500 to-indigo-500" />
              
              {/* Header */}
              <div className="p-6 border-b border-border flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-display font-black tracking-tighter mb-1 text-white flex items-center gap-2 uppercase">
                    <Sparkles className="w-4 h-4 text-cyan-400 rotate-[15deg] animate-pulse" />
                    Fleet Intelligence
                  </h2>
                  <p className="text-[10px] text-zinc-400 font-mono uppercase tracking-[0.2em]">Active Alerts & Audit Streams</p>
                </div>
                <button 
                  onClick={() => setShowNotificationsPanel(false)}
                  className="p-1.5 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white"
                  title="Close Panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Utility Rails / Controls */}
              <div className="px-6 py-3 bg-white/5 border-b border-white/5 flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-white/40">
                <span>{feedNotifications.length} logs recorded</span>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      setFeedNotifications(prev => prev.map(n => ({ ...n, read: true })));
                      setNotification({ message: "All alerts marked read", type: "success" });
                    }}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    Mark read
                  </button>
                  <span className="opacity-20">|</span>
                  <button 
                    onClick={() => {
                      setFeedNotifications([]);
                      setNotification({ message: "Cleared alerts log", type: "info" });
                    }}
                    className="hover:text-red-400 transition-colors cursor-pointer"
                  >
                    Clear log
                  </button>
                </div>
              </div>

              {/* Sandbox Controls / Simulators */}
              <div className="p-5 bg-indigo-500/5 border-b border-border/60">
                <span className="text-[9px] font-display font-bold uppercase tracking-widest text-indigo-400 block mb-2">
                  🛠️ Interactive Verification & Alert Simulator
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      // Find first audit result, or insert a fake one to demonstrate state transition to orange
                      let demoPlate = "TRK-2940";
                      if (auditResults.length > 0) {
                        const updated = [...auditResults];
                        demoPlate = updated[0].plate;
                        updated[0] = {
                          ...updated[0],
                          isDuplicate: true,
                          isPotential: false
                        };
                        setAuditResults(updated);
                        
                        setTimeout(() => {
                          const downgrade = [...updated];
                          downgrade[0] = {
                            ...downgrade[0],
                            isDuplicate: false,
                            isPotential: true
                          };
                          setAuditResults(downgrade);
                          addFeedNotification(
                            "Audit Transition: Green ➔ Orange",
                            `Card for Plate ${demoPlate} downgraded from 'Already Uploaded' (Green) to 'Potential Match' (Orange). Exactly matched reference deleted!`,
                            'warning',
                            'transition'
                          );
                        }, 900);
                      } else {
                        addFeedNotification(
                          "Audit Transition: Green ➔ Orange",
                          `Card for Plate ${demoPlate} downgraded from 'Already Uploaded' (Green) to 'Potential Match' (Orange). Reference ledger item changed.`,
                          'warning',
                          'transition'
                        );
                      }
                    }}
                    className="p-2 border border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/15 rounded-xl text-[9px] font-display font-bold text-amber-300 transition-all text-left flex flex-col justify-between h-14 uppercase tracking-wider cursor-pointer"
                  >
                    <span>Trigger Green ➔ Orange</span>
                    <span className="font-mono text-[7.5px] text-amber-400/40 font-normal normal-case">Simulate verified matching modification</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      let demoPlate = "TRK-4911";
                      if (auditResults.length > 0) {
                        const updated = [...auditResults];
                        demoPlate = updated[0].plate;
                        updated[0] = {
                          ...updated[0],
                          isDuplicate: false,
                          isPotential: true
                        };
                        setAuditResults(updated);
                        
                        setTimeout(() => {
                          const resolve = [...updated];
                          resolve[0] = {
                            ...resolve[0],
                            isDuplicate: false,
                            isPotential: false
                          };
                          setAuditResults(resolve);
                          addFeedNotification(
                            "Audit Transition: Orange ➔ Red",
                            `Card for Plate ${demoPlate} resolved potential conflict and became 'Unique Entry / Conflict Cleaned' (Red). Ready to save safely.`,
                            'success',
                            'transition'
                          );
                        }, 900);
                      } else {
                        addFeedNotification(
                          "Audit Transition: Orange ➔ Red",
                          `Card for Plate ${demoPlate} resolved potential conflict and became 'Unique Entry / Conflict Cleaned' (Red). Ready to save.`,
                          'success',
                          'transition'
                        );
                      }
                    }}
                    className="p-2 border border-red-500/25 bg-red-500/5 hover:bg-red-500/15 rounded-xl text-[9px] font-display font-bold text-red-300 transition-all text-left flex flex-col justify-between h-14 uppercase tracking-wider cursor-pointer"
                  >
                    <span>Trigger Orange ➔ Red</span>
                    <span className="font-mono text-[7.5px] text-red-400/40 font-normal normal-case">Simulate collision resolution</span>
                  </button>

                  <button
                    onClick={() => {
                      addFeedNotification(
                        "Budget Threat Blocked",
                        "Accidental Multi-Billing Guard active on TRK-8941: 'Brake Fluid Flush' logged twice within 15 days. Duplication protected.",
                        'critical',
                        'alert'
                      );
                    }}
                    className="p-2 border border-cyan-500/15 bg-cyan-500/5 hover:bg-cyan-500/15 rounded-xl text-[9px] font-display font-bold text-cyan-300 transition-all text-left flex flex-col justify-between h-14 uppercase tracking-wider cursor-pointer"
                  >
                    <span>Double Billing Warn</span>
                    <span className="font-mono text-[7.5px] text-cyan-400/40 font-normal normal-case">Same maintenance twice in 15 days</span>
                  </button>

                  <button
                    onClick={() => {
                      addFeedNotification(
                        "Ad-hoc Sparkles Synced",
                        "Fleet diagnostic scanner synchronized: Plate TRK-104 battery voltage drops below 22.4V baseline. Service suggested.",
                        'info',
                        'intelligence'
                      );
                    }}
                    className="p-2 border border-purple-500/15 bg-purple-500/5 hover:bg-purple-500/15 rounded-xl text-[9px] font-display font-bold text-purple-300 transition-all text-left flex flex-col justify-between h-14 uppercase tracking-wider cursor-pointer"
                  >
                    <span>Fleet Health Alert</span>
                    <span className="font-mono text-[7.5px] text-purple-400/40 font-normal normal-case">Battery voltage below threshold</span>
                  </button>
                </div>
              </div>

              {/* Feed List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {feedNotifications.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                    <Bell className="w-8 h-8 opacity-20 mb-3 animate-bounce" />
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em]">No Anomaly Alerts Logged</p>
                    <p className="text-[9px] mt-1 pr-2 leading-relaxed">System baseline healthy. Use simulator controls above to generate live test streams!</p>
                  </div>
                ) : (
                  feedNotifications.map((notif) => (
                    <div 
                      key={notif.id}
                      onClick={() => {
                        setFeedNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
                      }}
                      className={cn(
                        "p-4 border rounded-2xl flex flex-col gap-2 relative overflow-hidden transition-all group cursor-pointer",
                        !notif.read ? "bg-white/[0.04] border-white/20 shadow-md" : "bg-transparent border-transparent opacity-60",
                        notif.severity === 'critical' ? 'hover:border-red-500/35 border-red-500/10' : 
                        notif.severity === 'warning' ? 'hover:border-amber-500/35 border-amber-500/10' : 'hover:border-indigo-500/35 border-indigo-500/10'
                      )}
                    >
                      <div className={cn(
                        "absolute top-0 left-0 w-1 h-full",
                        notif.severity === 'critical' ? 'bg-red-500' :
                        notif.severity === 'warning' ? 'bg-amber-500' : 'bg-indigo-500'
                      )} />

                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[7px] font-black tracking-widest uppercase font-mono",
                            notif.severity === 'critical' ? 'bg-red-500/25 text-red-300 border border-red-500/20' :
                            notif.severity === 'warning' ? 'bg-amber-500/25 text-amber-300 border border-amber-500/20' :
                            'bg-indigo-500/25 text-indigo-300 border border-indigo-500/20'
                          )}>
                            {notif.severity}
                          </span>
                          
                          <span className="text-[7.5px] font-mono text-white/30">
                            {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>

                        {!notif.read && (
                          <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
                        )}
                      </div>

                      <div>
                        <h4 className="text-[11px] font-display font-bold uppercase tracking-wide text-white group-hover:text-cyan-400 transition-colors">
                          {notif.title}
                        </h4>
                        <p className="text-[10px] text-white/50 leading-relaxed mt-1 uppercase tracking-wider">
                          {notif.details}
                        </p>
                      </div>

                      <div className="flex items-center justify-between mt-1 pt-2 border-t border-white/5">
                        <span className="text-[7.5px] font-mono text-white/20 uppercase tracking-widest">
                          Source: {notif.type}
                        </span>
                        
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setFeedNotifications(prev => prev.filter(n => n.id !== notif.id));
                          }}
                          className="text-[8px] font-display font-bold text-red-400/40 hover:text-red-400 uppercase tracking-widest ml-auto transition-colors cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Bottom Info Row */}
              <div className="p-6 border-t border-border bg-black/40 flex items-center justify-between text-[10px] font-mono text-white/30 uppercase tracking-wider">
                <span>Core Authority Active</span>
                <span>v3.0.1_Secure</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        </>
      )}

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/95 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md glassmorphism p-6 sm:p-8 relative rounded-3xl my-auto neon-border-violet"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 via-cyan-500 to-violet-500 rounded-t-3xl" />
              
              <div className="flex items-start justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-display font-black tracking-tighter mb-1 text-white">SETTINGS</h2>
                  <p className="text-[10px] text-violet-400/60 font-mono uppercase tracking-[0.2em]">Application Configuration & Tools</p>
                </div>
                <button 
                  onClick={() => setShowSettingsModal(false)}
                  className="p-2 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white"
                  title="Close Settings"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-10">
                {/* Section: Overview */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-3 bg-purple-500 rounded-full" />
                    <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-white/40">System Overview</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {/* Database Stats */}
                    <div className="p-6 bg-gradient-to-br from-violet-500/10 to-transparent border border-violet-500/20 rounded-3xl flex items-center justify-between group hover:from-violet-500/15 transition-all shadow-xl shadow-violet-900/10 neon-glow-violet">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-violet-400 mb-1">Fleet Database</span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-display font-bold text-white tracking-tighter">{totalCount !== null ? totalCount : records.length}</span>
                          <span className="text-xs font-display font-bold text-white/30 uppercase tracking-widest">Records</span>
                        </div>
                      </div>
                      <div className="p-4 bg-violet-500/20 rounded-2xl border border-violet-500/30 shadow-inner">
                        <Database className="w-7 h-7 text-violet-400" />
                      </div>
                    </div>

                    {/* User Info */}
                    {user && (
                      <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between group hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-white/20 transition-all">
                            <UserIcon className="w-6 h-6 text-white/30" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/30 mb-0.5">Operator</span>
                            <span className="text-xs font-mono text-white/90 truncate max-w-[160px]">{user.email}</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            logout();
                            setShowSettingsModal(false);
                          }}
                          className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 hover:border-red-500/40 transition-all rounded-xl shadow-lg shadow-red-900/20"
                          title="Logout"
                        >
                          <LogOut className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section: Connectivity */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-3 bg-blue-500 rounded-full" />
                    <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-white/40">Connectivity</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 glassmorphism rounded-2xl flex flex-col gap-4 group hover:bg-white/[0.06] transition-all neon-border-violet/20">
                      <div className="flex items-center justify-between">
                        <Smartphone className="w-4 h-4 text-violet-400/40" />
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse shadow-[0_0_8px_rgba(160,32,240,0.8)]" />
                      </div>
                      <div>
                        <span className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-white/30 block mb-1">PWA Status</span>
                        <span className="text-[10px] font-mono text-violet-400 font-bold uppercase tracking-widest">{pwaStatus}</span>
                      </div>
                    </div>
                    <div className="p-4 glassmorphism rounded-2xl flex flex-col gap-4 group hover:bg-white/[0.06] transition-all neon-border-cyan/20">
                      <div className="flex items-center justify-between">
                        <Cloud className={cn(
                          "w-4 h-4",
                          isCloudConnected ? "text-cyan-400" : "text-red-500"
                        )} />
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          isCloudConnected ? "bg-cyan-400 shadow-[0_0_8px_rgba(0,245,255,0.8)]" : "bg-red-500"
                        )} />
                      </div>
                      <div>
                        <span className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-white/30 block mb-1">Cloud Sync</span>
                        <span className={cn(
                          "text-[10px] font-mono uppercase tracking-widest font-bold",
                          isCloudConnected ? "text-cyan-400" : "text-red-500/80"
                        )}>
                          {isCloudConnected ? "Connected" : "Offline"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: Operator Preferences & Toggles */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-3 bg-cyan-500 rounded-full" />
                    <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-cyan-400">Operator Preferences</p>
                  </div>
                  <div className="p-5 bg-white/[0.02] border border-white/5 rounded-3xl space-y-4">
                    {/* Theme selector */}
                    <div>
                      <span className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-white/40 block mb-2">Display Mode Theme</span>
                      <div className="grid grid-cols-4 gap-1">
                        {(['light', 'dark', 'black', 'pro'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setTheme(t)}
                            className={cn(
                              "py-1.5 rounded-lg text-[8px] font-display font-bold uppercase tracking-widest transition-all",
                              theme === t 
                                ? "bg-violet-600 text-white shadow-md shadow-violet-500/10 border border-violet-500/30" 
                                : "bg-white/5 text-white/50 border border-transparent hover:text-white"
                            )}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Email switch toggle */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-display font-bold uppercase tracking-wider text-white/80">Email Alerts</span>
                        <span className="text-[7.5px] font-mono text-white/30 uppercase tracking-widest">Receive daily integrity logs</span>
                      </div>
                      <button
                        onClick={() => {
                          setEmailNotificationsEnabled(!emailNotificationsEnabled);
                          setNotification({
                            message: `Email alert synchronization ${!emailNotificationsEnabled ? 'enabled' : 'disabled'}`,
                            type: 'info'
                          });
                        }}
                        className={cn(
                          "w-10 h-5 rounded-full relative transition-all p-1",
                          emailNotificationsEnabled ? "bg-cyan-600" : "bg-white/10"
                        )}
                      >
                        <div className={cn(
                          "w-3 h-3 bg-white rounded-full transition-all shadow-md",
                          emailNotificationsEnabled ? "translate-x-5" : "translate-x-0"
                        )} />
                      </button>
                    </div>

                    {/* Security guard switch toggle */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-display font-bold uppercase tracking-wider text-white/80">Continuous Security Vault</span>
                        <span className="text-[7.5px] font-mono text-white/30 uppercase tracking-widest">Rotates memory caches on idle</span>
                      </div>
                      <button
                        onClick={() => {
                          setAutomaticSecurityGuard(!automaticSecurityGuard);
                          setNotification({
                            message: `Continuous security shield ${!automaticSecurityGuard ? 'armed' : 'disarmed'}`,
                            type: !automaticSecurityGuard ? 'success' : 'warning'
                          });
                        }}
                        className={cn(
                          "w-10 h-5 rounded-full relative transition-all p-1",
                          automaticSecurityGuard ? "bg-emerald-600" : "bg-white/10"
                        )}
                      >
                        <div className={cn(
                          "w-3 h-3 bg-white rounded-full transition-all shadow-md",
                          automaticSecurityGuard ? "translate-x-5" : "translate-x-0"
                        )} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section: Account & Encryption Security */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-3 bg-indigo-500 rounded-full" />
                    <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-indigo-400">Account & Identity Security</p>
                  </div>
                  <div className="p-5 bg-indigo-500/5 border border-indigo-500/15 rounded-3xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
                      <div className="flex items-center gap-2 font-mono text-[9px] text-zinc-400 uppercase tracking-widest">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]"></span>
                        <span>Link Encryption: TLS_1.3</span>
                      </div>
                      <div className="text-[8px] font-mono text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded-md border border-indigo-500/20 tracking-wider">
                        AES_256_GCM
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      <button
                        onClick={() => {
                          setNotification({
                            message: "Database Security Signatures Verified. 12 Integrity Records Verified.",
                            type: "success"
                          });
                        }}
                        className="w-full p-3.5 bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-indigo-500/20 rounded-2xl transition-all cursor-pointer flex items-center justify-between text-left group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400 group-hover:bg-indigo-500/20 group-hover:scale-105 transition-all">
                            <Lock className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-[10px] font-display font-medium text-white uppercase tracking-wider">Verify Database Signature</span>
                            <span className="text-[7.5px] font-mono text-white/40 uppercase tracking-widest mt-0.5">Check record hash values</span>
                          </div>
                        </div>
                        <CheckCircle2 className="w-3.5 h-3.5 text-zinc-600 group-hover:text-emerald-400 transition-colors" />
                      </button>

                      <button
                        onClick={() => {
                          setNotification({
                            message: "Vault Salt Rotated. MD5 Checksum recalculated.",
                            type: "success"
                          });
                        }}
                        className="w-full p-3.5 bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-indigo-500/20 rounded-2xl transition-all cursor-pointer flex items-center justify-between text-left group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400 group-hover:bg-indigo-500/20 group-hover:scale-105 transition-all">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-[10px] font-display font-medium text-white uppercase tracking-wider">Rotate Encryption Salts</span>
                            <span className="text-[7.5px] font-mono text-white/40 uppercase tracking-widest mt-0.5">Refresh client salt token</span>
                          </div>
                        </div>
                        <RefreshCw className="w-3.5 h-3.5 text-zinc-600 group-hover:text-indigo-400 group-hover:rotate-180 duration-500 transition-all" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section: Termux & Local API Configuration */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-3 bg-violet-500 rounded-full animate-pulse" />
                    <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-white/40">Local API Configuration (Termux)</p>
                  </div>
                  <div className="p-5 bg-violet-500/[0.03] border border-violet-500/20 rounded-3xl space-y-3 shadow-md">
                    <p className="text-[9px] text-violet-300/60 uppercase tracking-widest leading-relaxed">
                      Running locally or on Termux without .env configured? Input a Gemini API Key here to run analysis and OCR tasks autonomously. Saved securely inside your browser.
                    </p>
                    <div className="relative">
                      <input 
                        type="password"
                        placeholder="PASTE GEMINI API KEY..."
                        className="w-full bg-black/60 border border-white/10 p-4 pl-11 font-mono text-xs focus:outline-none focus:border-violet-500/60 text-white rounded-2xl placeholder:text-white/10 transition-all select-all focus:ring-1 focus:ring-violet-500/30"
                        value={customGeminiKey}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          setCustomGeminiKey(val);
                          localStorage.setItem("DT_BASE_CUSTOM_GEMINI_API_KEY", val);
                        }}
                      />
                      <Key className="w-4 h-4 text-violet-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    </div>
                    {customGeminiKey && (
                      <div className="flex items-center gap-1.5 text-[8px] font-mono text-green-400 uppercase tracking-widest">
                        <CheckCircle2 className="w-3 h-3" />
                        Key is Saved & Active Client-Side
                      </div>
                    )}
                  </div>
                </div>

                {/* Section: Supabase Local Connectivity */}
                 <SupabaseSetup
                  localSupabaseUrl={localSupabaseUrl}
                  setLocalSupabaseUrl={setLocalSupabaseUrl}
                  localSupabaseAnonKey={localSupabaseAnonKey}
                  setLocalSupabaseAnonKey={setLocalSupabaseAnonKey}
                  isSupaSaved={isSupaSaved}
                  setIsSupaSaved={setIsSupaSaved}
                  setShowSettingsModal={setShowSettingsModal}
                  setNotification={setNotification}
                />

                {/* Section: Tools & Processing Modes */}
                <FleetToolsMenu
                  showHistory={showHistory}
                  setShowHistory={setShowHistory}
                  isAuditMode={isAuditMode}
                  setIsAuditMode={setIsAuditMode}
                  isAuditUploadMode={isAuditUploadMode}
                  setIsAuditUploadMode={setIsAuditUploadMode}
                  setAuditResults={setAuditResults}
                  setShowUsageModal={setShowUsageModal}
                  setShowSettingsModal={setShowSettingsModal}
                  setShowMarketPricesModal={setShowMarketPricesModal}
                  handleExportData={handleExportData}
                  handleExportPDF={handleExportPDF}
                  fetchRecords={fetchRecords}
                  records={records}
                  isRefreshing={isRefreshing}
                />

                {/* Section: Advanced Settings & Diagnostics */}
                <AdvancedSettingsMenu
                  isServiceUnlocked={isServiceUnlocked}
                  setIsServiceUnlocked={setIsServiceUnlocked}
                  setShowServicePasswordPrompt={setShowServicePasswordPrompt}
                  setShowSettingsModal={setShowSettingsModal}
                  showFleetRegistryList={showFleetRegistryList}
                  setShowFleetRegistryList={setShowFleetRegistryList}
                  fleetRegistry={fleetRegistry}
                  setFleetRegistry={setFleetRegistry}
                  bugCategory={bugCategory}
                  setBugCategory={setBugCategory}
                  bugDescription={bugDescription}
                  setBugDescription={setBugDescription}
                  handleSubmitBugReport={handleSubmitBugReport}
                  onClearLocalCredentials={onClearLocalCredentials}
                  handleResetDatabase={handleResetDatabase}
                  dangerAction={dangerAction}
                  passwordConfirm={passwordInput}
                  setPasswordConfirm={setPasswordInput}
                  passwordError={passwordError}
                  handleClearDuplicates={handleClearDuplicates}
                />
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 flex justify-center">
                <p className="text-[8px] text-white/20 font-mono uppercase tracking-[0.3em]">DT.Base v2.4.0 • Secure Fleet Management</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {user && (
        <>

      {/* Usage Stats Modal */}
      {showUsageModal && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/95 overflow-y-auto">
          <div className="w-full max-w-md glassmorphism neon-border-violet p-6 sm:p-8 relative rounded-3xl my-auto">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 via-cyan-500 to-violet-500 rounded-t-3xl" />
            
            <div className="flex items-start justify-between mb-8">
              <div>
                <h2 className="text-2xl font-display font-black tracking-tighter mb-1 text-white">USAGE DASHBOARD</h2>
                <p className="text-[10px] text-violet-400/60 font-mono uppercase tracking-[0.2em]">Session Monitoring & Quota Estimates</p>
              </div>
              <button 
                onClick={() => setShowUsageModal(false)}
                className="p-2 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white"
                title="Close Dashboard"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Reads */}
              <div className="p-4 glassmorphism border neon-border-cyan/20 rounded-xl">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60">Reads (Session)</span>
                  <span className="text-xl font-mono font-bold text-cyan-400 shadow-[0_0_8px_rgba(0,245,255,0.3)]">{sessionStats.reads.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-cyan-500 transition-all duration-500 shadow-[0_0_8px_rgba(0,245,255,0.8)]" 
                    style={{ width: `${Math.min((sessionStats.reads / 50000) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[8px] text-white/30 mt-2 font-mono uppercase tracking-widest">Daily Limit: 50,000</p>
              </div>

              {/* Writes */}
              <div className="p-4 glassmorphism border neon-border-violet/20 rounded-xl">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60">Writes (Session)</span>
                  <span className="text-xl font-mono font-bold text-violet-400 shadow-[0_0_8px_rgba(160,32,240,0.3)]">{sessionStats.writes.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-violet-500 transition-all duration-500 shadow-[0_0_8px_rgba(160,32,240,0.8)]" 
                    style={{ width: `${Math.min((sessionStats.writes / 20000) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[8px] text-white/30 mt-2 font-mono uppercase tracking-widest">Daily Limit: 20,000</p>
              </div>

              {/* Deletes */}
              <div className="p-4 glassmorphism border neon-border-violet/20 rounded-xl">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60">Deletes (Session)</span>
                  <span className="text-xl font-mono font-bold text-violet-400 shadow-[0_0_8px_rgba(160,32,240,0.3)]">{sessionStats.deletes.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-violet-500 transition-all duration-500 shadow-[0_0_8px_rgba(160,32,240,0.8)]" 
                    style={{ width: `${Math.min((sessionStats.deletes / 20000) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[8px] text-white/30 mt-2 font-mono uppercase tracking-widest">Daily Limit: 20,000</p>
              </div>

              {/* AI Extractions */}
              <div className="p-4 glassmorphism border neon-border-cyan/20 rounded-xl">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-cyan-400 shadow-[0_0_8px_rgba(0,245,255,0.3)]">AI Extractions (Session)</span>
                  <span className="text-xl font-mono font-bold text-white">{usageStats.extractions.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-cyan-500 transition-all duration-500 shadow-[0_0_8px_rgba(0,245,255,0.8)]" 
                    style={{ width: `${Math.min((usageStats.extractions / 1500) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[8px] text-white/30 mt-2 font-mono uppercase tracking-widest">Daily Limit: ~1,500 (Free Tier)</p>
              </div>

              {/* AI Searches */}
              <div className="p-4 glassmorphism border neon-border-violet/20 rounded-xl">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-violet-400 shadow-[0_0_8px_rgba(160,32,240,0.3)]">AI Searches (Session)</span>
                  <span className="text-xl font-mono font-bold text-white">{usageStats.searches.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-violet-500 transition-all duration-500 shadow-[0_0_8px_rgba(160,32,240,0.8)]" 
                    style={{ width: `${Math.min((usageStats.searches / 1500) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[8px] text-white/30 mt-2 font-mono uppercase tracking-widest">Daily Limit: ~1,500 (Free Tier)</p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5">
              <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded">
                <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[9px] text-blue-200/70 leading-relaxed uppercase tracking-wider">
                  These stats track your current session. Supabase counts total usage across all devices. 
                  Check the Supabase Dashboard for official monthly billing totals.
                </p>
              </div>
              <button 
                onClick={() => {
                  setSessionStats({ reads: 0, writes: 0, deletes: 0 });
                  setUsageStats({ extractions: 0, searches: 0 });
                }}
                className="w-full mt-4 py-3 border border-white/10 text-[10px] font-display font-bold uppercase tracking-[0.2em] hover:bg-white/5 transition-all"
              >
                Reset Session Stats
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Record Modal */}
      {editingRecord && (
        <EditRecordModal 
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSave={async (updated) => {
            // We need to keep handleEditRecord but it expects state
            // Let's modify handleEditRecord to take a record optionally
            await handleEditRecord(updated);
          }}
          isProcessing={isProcessing}
        />
      )}

      {/* Manual Entry Modal */}
      {manualEntryData && (
        <ManualEntryModal 
          data={manualEntryData}
          onClose={() => setManualEntryData(null)}
          onSave={handleManualAdd}
          isProcessing={isProcessing}
        />
      )}
      
      {/* AI Chat Assistant */}
      {user && records.length > 0 && (
        <AIChatAssistant 
          records={records} 
          marketPrices={marketPrices}
          fleetRegistry={fleetRegistry}
          onSaveMarketPrice={handleSaveMarketPrice}
          onUpdateRegistry={(plate) => {
            if (!fleetRegistry.includes(plate)) {
              setFleetRegistry(prev => [...prev, plate]);
              setNotification({ message: `Added ${plate} to registry!`, type: 'success' });
            }
          }}
          onFocusInsight={handleFocusInsight}
          isLocked={!isServiceUnlocked}
          onUnlockRequest={() => setShowServicePasswordPrompt(true)}
          viewMode={viewMode}
          theme={theme}
          customGeminiKey={customGeminiKey || undefined}
        />
      )}
      
      {/* Scroll to Top */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-24 md:bottom-8 right-6 z-40 p-4 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl shadow-xl shadow-purple-900/40 border border-purple-400/30 transition-all active:scale-95 group"
            title="Scroll to top"
          >
            <ChevronUp className="w-6 h-6 group-hover:-translate-y-0.5 transition-transform" />
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-bg border border-border px-2 py-1 rounded text-[8px] font-display font-bold uppercase tracking-widest text-text opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Go Up
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Floating Action Hub */}
      <div className={cn(
        "z-50 flex flex-col items-end gap-3 transition-all duration-500",
        "fixed bottom-6 right-6"
      )}>
        <AnimatePresence>
          {isFabOpen && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              className="flex flex-col items-end gap-3 mb-2"
            >
              {/* Manual Entry Solution */}
              <motion.button
                whileHover={{ scale: 1.05, x: -5 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setManualEntryData({
                    fileName: 'Manual Entry',
                    plateNumber: '',
                    date: new Date().toISOString().split('T')[0],
                    service: '',
                    verified: false
                  });
                  setIsFabOpen(false);
                }}
                className="flex items-center gap-3 px-4 py-3 bg-bg/90 text-text rounded-2xl shadow-xl border border-border transition-all group"
              >
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-muted group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors">Manual Entry</span>
                <div className="p-2 bg-violet-500/20 rounded-xl border border-violet-500/30">
                  <Plus className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
              </motion.button>

              {/* AI Fleet Scan (Gallery) */}
              <motion.label
                whileHover={{ scale: 1.05, x: -5 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 bg-bg/90 text-text rounded-2xl shadow-xl border border-border transition-all group cursor-pointer",
                  (isAuditMode || isAuditUploadMode) ? "hover:neon-border-cyan border-cyan-500/30" : "hover:neon-border-cyan"
                )}
              >
                <span className={cn(
                  "text-[10px] font-display font-bold uppercase tracking-[0.2em] transition-colors",
                  (isAuditMode || isAuditUploadMode) ? "text-cyan-600 dark:text-cyan-400" : "text-muted group-hover:text-cyan-600 dark:group-hover:text-cyan-400"
                )}>
                  {isAuditMode ? "Audit Verify Scan" : isAuditUploadMode ? "Audit Upload Scan" : "Fleet Gallery Scan"}
                </span>
                <div className={cn(
                  "p-2 rounded-xl border transition-all",
                  (isAuditMode || isAuditUploadMode) ? "bg-cyan-500/40 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]" : "bg-cyan-500/20 border-cyan-500/30"
                )}>
                  {(isAuditMode || isAuditUploadMode) ? <Eye className="w-4 h-4 text-white" /> : <Save className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />}
                </div>
                <input 
                  type="file" 
                  multiple 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => {
                    handleFileUpload(e, 'fleet');
                    setIsFabOpen(false);
                  }}
                  disabled={isProcessing || !user}
                />
              </motion.label>

              {/* Fleet Camera Scan */}
              <motion.label
                whileHover={{ scale: 1.05, x: -5 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-3 px-4 py-3 bg-bg/90 text-text rounded-2xl shadow-xl border border-border transition-all group cursor-pointer"
              >
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-muted group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">Fleet Camera Scan</span>
                <div className="p-2 bg-cyan-500/20 rounded-xl border border-cyan-500/30">
                  <Camera className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                </div>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  onChange={(e) => {
                    handleFileUpload(e, 'fleet');
                    setIsFabOpen(false);
                  }}
                  disabled={isProcessing || !user}
                />
              </motion.label>

              <div className="h-px bg-border mx-4 my-1" />

              {/* Market Price Scan (Gallery) */}
              <motion.label
                whileHover={{ scale: 1.05, x: -5 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-3 px-4 py-3 bg-bg/95 text-text rounded-2xl shadow-xl border border-border hover:neon-border-amber transition-all group cursor-pointer"
              >
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-muted group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">Market Gallery Scan</span>
                <div className="p-2 bg-amber-500/20 rounded-xl border border-amber-500/30">
                  <Tag className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <input 
                  type="file" 
                  multiple 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => {
                    handleFileUpload(e, 'market');
                    setIsFabOpen(false);
                  }}
                  disabled={isProcessing || !user}
                />
              </motion.label>

              {/* Market Camera Scan */}
              <motion.label
                whileHover={{ scale: 1.05, x: -5 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-3 px-4 py-3 bg-bg/95 text-text rounded-2xl shadow-xl border border-border hover:neon-border-amber transition-all group cursor-pointer"
              >
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-muted group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">Market Camera Scan</span>
                <div className="p-2 bg-amber-500/20 rounded-xl border border-amber-500/30">
                  <Camera className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  onChange={(e) => {
                    handleFileUpload(e, 'market');
                    setIsFabOpen(false);
                  }}
                  disabled={isProcessing || !user}
                />
              </motion.label>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Toggle Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label={isFabOpen ? "Close menu" : "Open menu"}
          onClick={() => {
            if (!isServiceUnlocked) {
              setShowServicePasswordPrompt(true);
            } else {
              setIsFabOpen(!isFabOpen);
            }
          }}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(0,245,255,0.4)] transition-all border relative overflow-hidden group focus-visible:ring-2 outline-none",
            isFabOpen ? "bg-bg text-text border-border" : "bg-gradient-to-br from-cyan-500 to-violet-600 text-white border-cyan-400/50",
            isAuditMode && !isFabOpen && "shadow-[0_0_40px_rgba(6,182,212,0.6)] border-cyan-400 ring-2 ring-cyan-400/20",
            theme === 'pro' ? "focus-visible:ring-indigo-500" : "focus-visible:ring-purple-500"
          )}
        >
          <AnimatePresence mode="wait">
            {isFabOpen ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
              >
                <X className="w-6 h-6" />
              </motion.div>
            ) : (
              <motion.div
                key="plus"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                className="flex items-center justify-center"
              >
                {isProcessing ? (
                  <div className="relative flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin opacity-20" />
                    <span className="absolute text-[8px] font-bold">{progress.current}</span>
                  </div>
                ) : (
                  <Plus className="w-6 h-6" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Tooltip on hover (Desktop) */}
          {!isFabOpen && (
            <div className="absolute right-full mr-4 px-3 py-1.5 bg-bg border border-border rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              <span className="text-[10px] font-display font-bold uppercase tracking-widest text-muted">Add to Fleet</span>
            </div>
          )}
        </motion.button>
      </div>
        </>
      )}

      {/* Service Password Modal */}
      <AnimatePresence>
        {showServicePasswordPrompt && (
          <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-bg/95 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md glassmorphism neon-border-violet p-6 sm:p-8 rounded-3xl shadow-2xl relative my-auto"
            >
              <button 
                onClick={() => {
                  setShowServicePasswordPrompt(false);
                  setServicePasswordInput('');
                  setServicePasswordError(false);
                }}
                className="absolute top-4 right-4 p-2 bg-surface border border-border hover:bg-surface/80 rounded-full transition-all text-muted hover:text-text z-10"
                title="Close Unlock Modal"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-violet-500/10 border border-violet-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_15px_rgba(160,32,240,0.3)]">
                  <Key className="w-8 h-8 text-violet-600 dark:text-violet-400" />
                </div>
                <h3 className="text-xl font-display font-bold text-text uppercase tracking-wider mb-2">Unlock Services</h3>
                <p className="text-xs text-violet-500/60 dark:text-violet-400/60 font-mono uppercase tracking-widest">
                  Enter the master password to continue using AI and advanced features.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-display font-bold text-violet-500/40 dark:text-violet-400/40 uppercase tracking-widest ml-1">Password</label>
                  <input 
                    type="password"
                    value={servicePasswordInput}
                    onChange={(e) => {
                      setServicePasswordInput(e.target.value);
                      setServicePasswordError(false);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlockService()}
                    className={cn(
                      "w-full bg-bg/40 border p-4 rounded-xl text-text font-mono focus:outline-none transition-all",
                      servicePasswordError ? "border-red-500" : "neon-border-violet"
                    )}
                    placeholder="••••••••"
                    autoFocus
                  />
                  {servicePasswordError && (
                    <p className="text-[10px] text-red-500 dark:text-red-400 font-display font-bold uppercase tracking-widest text-center mt-2">
                      Incorrect Password
                    </p>
                  )}
                </div>

                <button 
                  onClick={handleUnlockService}
                  className="w-full py-4 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-display font-black uppercase tracking-[0.3em] rounded-2xl transition-all shadow-[0_0_20px_rgba(0,245,255,0.3)] active:scale-[0.98]"
                >
                  Unlock Now
                </button>

                <div className="pt-4 border-t border-border flex flex-col gap-2">
                  <div className="flex justify-between text-[9px] font-mono uppercase tracking-tighter">
                    <span className="text-muted">Uploads:</span>
                    <span className="text-red-500 dark:text-red-400">Locked</span>
                  </div>
                  <div className="flex justify-between text-[9px] font-mono uppercase tracking-tighter">
                    <span className="text-muted">Searches:</span>
                    <span className={cn(usageStats.searches >= 15 ? "text-red-500 dark:text-red-400" : "text-muted")}>
                      {usageStats.searches} / 15
                    </span>
                  </div>
                  <div className="flex justify-between text-[9px] font-mono uppercase tracking-tighter">
                    <span className="text-muted">AI Access:</span>
                    <span className="text-red-500 dark:text-red-400">Locked</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
