import React, { useState, useMemo, useEffect } from 'react';
import { MarketPrice, PaymentRecord } from '../types';
import { 
  Tag, Search, Shield, Zap, TrendingUp, ArrowUpRight, 
  MapPin, Clock, Globe, Filter, ExternalLink, Info,
  Receipt, TrendingDown, Calendar, Truck, 
  ChevronRight, ArrowDownRight, DollarSign, Wallet, 
  Download, PieChart, Database, RefreshCw, AlertCircle, CheckCircle2, X, Plus, Terminal, Camera, Image as ImageIcon,
  Eye, EyeOff
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { fetchLedgerItems, parseRawLedgerData, bulkSaveLedgerItems, LedgerItem } from '../services/ledgerService';
import { extractMaintenanceData, getAIErrorMessage } from '../services/aiService';
import { supabase } from '../supabase';
import { resizeImage } from '../lib/utils';

interface MarketplaceProps {
  marketPrices: MarketPrice[];
  payments?: PaymentRecord[];
  isLocked?: boolean;
  onUnlockRequest?: () => void;
  user_id?: string;
}

export function Marketplace({ marketPrices, payments = [], isLocked, onUnlockRequest, user_id }: MarketplaceProps) {
  const [plateQuery, setPlateQuery] = useState('');
  const [keywordQuery, setKeywordQuery] = useState('');
  const [priceQuery, setPriceQuery] = useState('');
  const [showPriceResults, setShowPriceResults] = useState(false);
  
  // Supabase Ledger State
  const [dbLedgerItems, setDbLedgerItems] = useState<LedgerItem[]>([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [rawTextToSync, setRawTextToSync] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'parsing' | 'syncing' | 'extracting' | 'success' | 'error'>('idle');
  const [syncError, setSyncStatusError] = useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [showSql, setShowSql] = useState(false);
  const [showResultsList, setShowResultsList] = useState(true);
  const [showFullFleet, setShowFullFleet] = useState(false);

  const copySqlToClipboard = () => {
    const sql = `-- 1. Create Table
CREATE TABLE IF NOT EXISTS financial_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plate TEXT NOT NULL,
  service_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'KSH',
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified BOOLEAN DEFAULT FALSE
);

-- 2. Enable RLS
ALTER TABLE financial_ledger ENABLE ROW LEVEL SECURITY;

-- 3. Create Policies
CREATE POLICY "Public Read" ON financial_ledger FOR SELECT USING (true);
CREATE POLICY "Auth Insert" ON financial_ledger FOR INSERT TO authenticated WITH CHECK (true);`;
    navigator.clipboard.writeText(sql);
  };

  // Load Ledger Items from DB
  const loadLedger = async () => {
    if (!supabase) {
      setLedgerError("Database not connected. Please check your Supabase secrets.");
      return;
    }
    setIsLoadingLedger(true);
    setLedgerError(null);
    try {
      const items = await fetchLedgerItems();
      setDbLedgerItems(items);
    } catch (err: any) {
      console.error('Failed to load ledger', err);
      setLedgerError(err.message || "Failed to fetch from database.");
    } finally {
      setIsLoadingLedger(false);
    }
  };

  useEffect(() => {
    if (!isLocked) {
      loadLedger();
    }
  }, [isLocked]);

  // Combined Ledger Logic
  const allLedgerItems = useMemo(() => {
    const staticItems: LedgerItem[] = payments.flatMap(p => 
      p.items.map(item => ({
        plate: p.plate,
        service_date: p.date,
        description: item.description,
        amount: item.amount,
        currency: item.currency
      }))
    );
    return [...dbLedgerItems, ...staticItems].sort((a, b) => 
      new Date(b.service_date).getTime() - new Date(a.service_date).getTime()
    );
  }, [payments, dbLedgerItems]);

  // 1. Filter by Plate
  const plateFilteredItems = useMemo(() => {
    if (!plateQuery.trim()) {
      return showFullFleet ? allLedgerItems : allLedgerItems.slice(0, 3);
    }
    return allLedgerItems.filter(item => 
      item.plate.toLowerCase().includes(plateQuery.toLowerCase())
    );
  }, [allLedgerItems, plateQuery, showFullFleet]);

  // 2. Filter by Keyword (within plate results)
  const keywordFilteredItems = useMemo(() => {
    if (!keywordQuery.trim()) return plateFilteredItems;
    return plateFilteredItems.filter(item => 
      item.description.toLowerCase().includes(keywordQuery.toLowerCase())
    );
  }, [plateFilteredItems, keywordQuery]);

  // 3. Price Search (Global Smart Intelligence)
  const priceSearchResults = useMemo(() => {
    if (!priceQuery.trim()) return [];
    const query = priceQuery.toLowerCase();
    
    const matches = allLedgerItems.filter(item => {
      const desc = item.description.toLowerCase();
      const raw = item.description.trim();
      
      // Filter Logic:
      // 1. Must contain search query
      if (!desc.includes(query)) return false;
      
      // 2. "Smart" filter: Ignore complicated or unclear items
      // Rule: At least 4 chars, contains letters, not too many symbols
      if (raw.length < 4) return false;
      if (!/[a-zA-Z]/.test(raw)) return false;
      if ((raw.match(/[^a-zA-Z0-9\s]/g) || []).length > 5) return false; // Too many symbols = unclear
      if (raw.length > 55) return false; // Too long usually means it's a messy note, not a clear spare/labour
      
      return true;
    });

    // 3. Ignore repeated spares and labour (Deduplicate)
    const uniqueItems = new Map<string, LedgerItem>();
    
    matches.forEach(item => {
      const normalizedDesc = item.description.toLowerCase().trim();
      const existing = uniqueItems.get(normalizedDesc);
      
      // Heuristic: Keep verified items or items with the most plausible price
      if (!existing || (item.verified && !existing.verified)) {
        uniqueItems.set(normalizedDesc, item);
      }
    });

    return Array.from(uniqueItems.values()).sort((a, b) => b.amount - a.amount);
  }, [allLedgerItems, priceQuery]);

  const handleSyncData = async () => {
    if (!rawTextToSync.trim()) return;
    setSyncStatus('parsing');
    setSyncStatusError(null);
    try {
      const parsedItems = parseRawLedgerData(rawTextToSync);
      if (parsedItems.length === 0) {
        setSyncStatus('error');
        setSyncStatusError('No valid data found.');
        return;
      }
      setSyncStatus('syncing');
      await bulkSaveLedgerItems(parsedItems.map(item => ({ ...item, user_id })));
      setSyncStatus('success');
      setRawTextToSync('');
      loadLedger();
      
      // Reset to idle after 2 seconds
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (err: any) {
      setSyncStatus('error');
      setSyncStatusError(err.message || 'Sync failed.');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

      setSyncStatus('extracting');
      setSyncStatusError(null);

      let totalExtracted = 0;
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const objectUrl = URL.createObjectURL(file);
          const base64 = await resizeImage(objectUrl, 2048);
          URL.revokeObjectURL(objectUrl);
          const result = await extractMaintenanceData(base64, file.type);
          
          if (result.records && result.records.length > 0) {
            totalExtracted += result.records.length;
            const ledgerItems: LedgerItem[] = result.records.map(r => ({
              plate: r.plate_number,
              service_date: r.service_date,
              description: r.service_description,
              amount: r.amount || 0,
              currency: r.currency || 'KSH',
              user_id
            }));
            
            await bulkSaveLedgerItems(ledgerItems);
          }
        }

        if (totalExtracted === 0) {
          setSyncStatus('error');
          setSyncStatusError('AI could not find clear maintenance logs in the provided images. Please ensure the plate number and entries are visible.');
        } else {
          setSyncStatus('success');
          loadLedger();
          // Reset to idle after 2 seconds
          setTimeout(() => setSyncStatus('idle'), 3000);
        }
      } catch (err: any) {
      console.error('Image extraction error:', err);
      setSyncStatus('error');
      setSyncStatusError(getAIErrorMessage(err));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (isLocked) {
    return (
      <div className="flex flex-col items-center justify-center p-20 glassmorphism rounded-3xl border border-blue-500/20 text-center">
        <Globe className="w-10 h-10 text-blue-500 mb-6" />
        <h2 className="text-xl font-display font-bold text-white mb-2 italic">IntelCenter Locked</h2>
        <button onClick={onUnlockRequest} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-display font-bold uppercase tracking-widest text-[10px] mt-2">Authorize Access</button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-8">
      <div className="text-center space-y-0">
        <h1 className="text-xl md:text-3xl font-display font-black text-white italic tracking-tighter uppercase">
          Intel<span className="text-blue-500">Center</span>
        </h1>
        <p className="text-muted text-[7px] uppercase tracking-[0.3em] font-bold opacity-30">
          Fleet Intelligence
        </p>
      </div>

      {/* THREE SEARCH BARS */}
      <div className="max-w-md mx-auto space-y-1.5 px-2">
        {/* 1. Plate Search */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur-sm opacity-5 group-hover:opacity-10 transition-all" />
          <div className="relative bg-black/40 backdrop-blur-md rounded-xl border border-white/5 p-1.5 flex items-center gap-2 hover:border-blue-500/20 transition-all">
            <div className="w-7 h-7 bg-blue-500/10 rounded-lg flex items-center justify-center border border-blue-500/20 flex-shrink-0">
              <Truck className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="flex-1">
              <input 
                type="text"
                placeholder="Vehicle Plate"
                className="w-full bg-transparent border-none outline-none font-display font-bold text-sm text-white placeholder:text-white/10 italic leading-tight"
                value={plateQuery}
                onChange={(e) => setPlateQuery(e.target.value)}
              />
            </div>
            {plateQuery && (
              <button onClick={() => setPlateQuery('')} className="p-1 hover:bg-white/5 rounded text-muted/30">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* 2. Keyword Search */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-600 to-orange-600 rounded-xl blur-sm opacity-5 group-hover:opacity-10 transition-all" />
          <div className={cn(
            "relative bg-black/40 backdrop-blur-md rounded-xl border border-white/5 p-1.5 flex items-center gap-2 transition-all",
            !plateQuery ? "opacity-50" : "hover:border-amber-500/20"
          )}>
            <div className="w-7 h-7 bg-amber-500/10 rounded-lg flex items-center justify-center border border-amber-500/20 flex-shrink-0">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="flex-1">
              <input 
                type="text"
                placeholder="Reference Keyword"
                className="w-full bg-transparent border-none outline-none font-display font-bold text-sm text-white placeholder:text-white/10 italic leading-tight"
                value={keywordQuery}
                onChange={(e) => setKeywordQuery(e.target.value)}
              />
            </div>
            {keywordQuery && (
              <button onClick={() => setKeywordQuery('')} className="p-1 hover:bg-white/5 rounded text-muted/30">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* 3. Price Search */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl blur-sm opacity-5 group-hover:opacity-10 transition-all" />
          <div className="relative bg-black/40 backdrop-blur-md rounded-xl border border-white/5 p-1.5 flex items-center gap-2 hover:border-emerald-500/20 transition-all">
            <div className="w-7 h-7 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20 flex-shrink-0">
              <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="flex-1">
              <input 
                type="text"
                placeholder="Market Analysis"
                className="w-full bg-transparent border-none outline-none font-display font-bold text-sm text-white placeholder:text-white/10 italic leading-tight"
                value={priceQuery}
                onChange={(e) => {
                  setPriceQuery(e.target.value);
                  setShowPriceResults(false);
                }}
              />
            </div>
            <button 
              onClick={() => priceQuery.trim() && setShowPriceResults(true)}
              className={cn(
                "h-7 px-2 rounded font-display font-black text-[7px] uppercase tracking-widest transition-all",
                priceQuery.trim() ? "bg-emerald-600/80 hover:bg-emerald-500 text-white" : "bg-white/5 text-white/20 cursor-not-allowed"
              )}
            >
              Run
            </button>
          </div>
        </div>
      </div>

      {/* RESULTS AREA */}
      <div className="max-w-md mx-auto space-y-3 px-2">
        {/* Latest High-Confidence Result (Active only when searching) */}
        {plateQuery && keywordFilteredItems.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glassmorphism p-3 rounded-2xl border-2 border-blue-500/40 bg-blue-500/5 shadow-[0_0_30px_rgba(59,130,246,0.1)] relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-2 opacity-5">
              <Zap className="w-8 h-8 text-blue-500" />
            </div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-500 rounded-lg flex items-center justify-center shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                  <TrendingUp className="w-3 h-3 text-white" />
                </div>
                <h3 className="text-[10px] font-display font-black text-white italic tracking-tighter uppercase">Latest Intel Result</h3>
              </div>
              <div className="bg-blue-600/20 px-2 py-0.5 rounded-full border border-blue-500/30">
                <span className="text-[7px] font-mono text-blue-400 font-bold uppercase tracking-widest animate-pulse">Live Match</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-display font-black text-white italic leading-tight uppercase truncate max-w-[200px]">
                  {keywordFilteredItems[0].description}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[8px] font-mono text-white/40 uppercase font-bold tracking-widest">{new Date(keywordFilteredItems[0].service_date).toLocaleDateString()}</span>
                  <span className="text-white/10">•</span>
                  <p className="text-[8px] font-display font-bold text-blue-400 uppercase tracking-widest italic">{keywordFilteredItems[0].plate}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-display font-black text-blue-400 italic leading-none">
                  <span className="text-[9px] not-italic mr-1 opacity-50">KSH</span>
                  {keywordFilteredItems[0].amount.toLocaleString()}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Global Price Results Overlay/Section */}
        <AnimatePresence>
          {showPriceResults && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="glassmorphism p-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-1.5 shadow-[0_0_20px_rgba(16,185,129,0.05)]">
                <div className="flex items-center justify-between border-b border-white/5 pb-1">
                  <h3 className="text-[7px] font-display font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                    <TrendingDown className="w-2.5 h-2.5" />
                    Internal Price Reference
                  </h3>
                  <button onClick={() => setShowPriceResults(false)} className="p-1 hover:bg-white/5 rounded">
                    <X className="w-2.5 h-2.5 text-muted" />
                  </button>
                </div>
                
                {priceSearchResults.length > 0 ? (
                  <div className="grid grid-cols-1 gap-1">
                    {priceSearchResults.slice(0, 8).map((res, i) => (
                      <div key={i} className="flex items-center justify-between p-1.5 rounded bg-black/40 border border-white/5 group/ref">
                        <div className="flex flex-col">
                          <span className="text-[8px] text-white/90 font-bold truncate max-w-[150px] group-hover/ref:text-emerald-400 transition-colors uppercase italic">{res.description}</span>
                          <div className="flex items-center gap-1 opacity-20">
                            <span className="text-[5px] text-muted font-mono uppercase">{res.plate}</span>
                            <span className="text-[5px] text-muted font-mono">•</span>
                            <span className="text-[5px] text-muted font-mono">{new Date(res.service_date).getFullYear()}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-display font-black text-emerald-400 italic">
                            {res.amount.toLocaleString()} 
                            <span className="text-[6px] ml-0.5 opacity-40 not-italic">KSH</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 opacity-40">
                    <div className="text-[7px] font-display font-bold uppercase tracking-widest text-emerald-500/50 mb-1">Low Intelligence Confidence</div>
                    <p className="text-[6px] text-white/20 font-mono italic">No clear reference data found</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Plate Results List */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowResultsList(!showResultsList)}
                className={cn(
                  "flex items-center gap-2 group/toggle transition-all",
                  !showResultsList && "opacity-50"
                )}
              >
                <h2 className="text-[9px] font-display font-black text-white italic tracking-tighter uppercase flex items-center gap-1.5">
                  <Database className="w-2.5 h-2.5 text-blue-500" />
                  {plateQuery ? 'Fleet Intelligence' : 'Fleet Activity'}
                </h2>
                <div className="w-4 h-4 rounded-full bg-white/5 flex items-center justify-center group-hover/toggle:bg-white/10 transition-colors">
                  {showResultsList ? (
                    <Eye className="w-2 h-2 text-white/40" />
                  ) : (
                    <EyeOff className="w-2 h-2 text-white/40" />
                  )}
                </div>
              </button>
              
              {!plateQuery && showResultsList && (
                <button 
                  onClick={() => setShowFullFleet(!showFullFleet)}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[6px] font-display font-black uppercase tracking-widest transition-all border",
                    showFullFleet 
                      ? "bg-blue-500/20 border-blue-500/30 text-blue-400" 
                      : "bg-white/5 border-white/10 text-white/30 hover:bg-white/10 hover:text-white/50"
                  )}
                >
                  {showFullFleet ? "Full History" : "View All"}
                </button>
              )}

              {plateQuery && keywordFilteredItems.length > 0 && showResultsList && (
                <div className="flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  <span className="text-[7px] font-display font-black text-emerald-400 italic">
                    KSH {keywordFilteredItems.reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
            <div className="text-[6px] font-mono text-muted uppercase tracking-[0.2em] font-bold opacity-30">
              {plateQuery ? `${keywordFilteredItems.length} Entries` : 'Recent Syncs'}
            </div>
          </div>

          <AnimatePresence>
            {showResultsList && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-1">
                  {ledgerError && (
                    <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-red-500/10 rounded flex items-center justify-center border border-red-500/20">
                          <AlertCircle className="w-3 h-3 text-red-500" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-[8px] font-display font-black text-red-100 uppercase tracking-widest italic">Sync Error</h4>
                          <p className="text-[7px] text-red-200/30 font-mono uppercase truncate">DB Connectivity issue</p>
                        </div>
                        <button 
                          onClick={loadLedger} 
                          className="p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded transition-all"
                        >
                          <RefreshCw className="w-2.5 h-2.5 text-red-500" />
                        </button>
                      </div>
                      
                      {ledgerError.includes("financial_ledger") && (
                        <div className="space-y-1.5">
                          <button 
                            onClick={() => setShowSql(!showSql)}
                            className="w-full py-1 bg-red-500/10 text-red-300 rounded text-[7px] font-display font-black uppercase tracking-widest border border-red-500/10"
                          >
                            {showSql ? "Hide FIX" : "Show Setup FIX"}
                          </button>
                          
                          <AnimatePresence>
                            {showSql && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden space-y-1.5 bg-black/60 p-2 rounded-lg"
                              >
                                <p className="text-[7px] text-white/40 font-mono uppercase leading-tight">
                                  Run in Supabase Editor:
                                </p>
                                <button 
                                  onClick={copySqlToClipboard}
                                  className="w-full py-1.5 bg-emerald-500/10 text-emerald-400 rounded text-[7px] font-display font-black uppercase tracking-widest flex items-center justify-center gap-1.5 border border-emerald-500/10"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                  Copy ALL SQL
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  )}
                  <AnimatePresence mode="popLayout">
                    {keywordFilteredItems.length > 0 ? (
                      keywordFilteredItems.map((item, idx) => (
                        <motion.div 
                          layout
                          initial={{ opacity: 0, y: 2 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          key={`${item.plate}-${idx}`}
                          className="group"
                        >
                          <div className={cn(
                            "backdrop-blur-md p-3 rounded-xl border transition-all flex items-center justify-between gap-3 group/item",
                            idx === 0 && plateQuery ? "bg-blue-600/5 border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.05)]" : "bg-black/30 border-white/5 hover:border-blue-500/30 hover:bg-black/40"
                          )}>
                            <div className="flex items-center gap-3">
                              {/* 1. Date Segment */}
                              <div className={cn(
                                "w-10 h-10 rounded-lg flex flex-col items-center justify-center border transition-all shadow-inner",
                                idx === 0 && plateQuery ? "bg-blue-500/10 border-blue-500/20" : "bg-white/5 border-white/10"
                              )}>
                                <div className={cn(
                                  "text-[6px] font-display font-black uppercase tracking-tighter leading-none mb-0.5",
                                  idx === 0 && plateQuery ? "text-blue-400" : "text-white/40"
                                )}>
                                  {new Date(item.service_date).toLocaleString('default', { month: 'short' })}
                                </div>
                                <div className="text-sm font-display font-black text-white leading-none">
                                  {new Date(item.service_date).getDate()}
                                </div>
                                <div className="text-[5px] font-mono text-white/20 uppercase leading-none mt-0.5">
                                  {new Date(item.service_date).getFullYear()}
                                </div>
                              </div>

                              {/* 2. Info Segment */}
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={cn(
                                    "px-1.5 py-0.5 border rounded text-[9px] font-display font-black italic tracking-wider leading-none shadow-[0_0_10px_rgba(59,130,246,0.1)]",
                                    idx === 0 && plateQuery ? "bg-blue-500/20 border-blue-500/40 text-blue-300" : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                                  )}>
                                    {item.plate}
                                  </span>
                                  {idx === 0 && plateQuery && (
                                    <span className="text-[6px] font-display font-black text-blue-400 uppercase tracking-widest animate-pulse px-1">LATEST</span>
                                  )}
                                  {item.verified && (
                                    <div className="flex items-center gap-1">
                                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                                      <span className="text-[6px] font-mono text-emerald-500/50 uppercase font-bold tracking-tighter">Verified</span>
                                    </div>
                                  )}
                                </div>
                                <h4 className="text-[10px] font-display font-bold text-white uppercase italic tracking-tight line-clamp-1 group-hover/item:text-blue-50 transition-all">
                                  {item.description}
                                </h4>
                              </div>
                            </div>

                            {/* 3. Action/Value Segment */}
                            <div className="text-right flex-shrink-0">
                              <div className="text-sm font-display font-black text-white italic tracking-tighter leading-none flex items-baseline gap-0.5 justify-end group-hover/item:text-blue-400 transition-all">
                                <span className="text-[7px] not-italic opacity-30 font-mono italic">KSH</span>
                                {item.amount.toLocaleString()}
                              </div>
                              <div className="flex items-center justify-end gap-1 mt-1">
                                <div className={cn("w-1 h-1 rounded-full", idx === 0 && plateQuery ? "bg-blue-500" : "bg-blue-500/20")} />
                                <span className="text-[6px] text-muted font-mono uppercase tracking-[0.1em] opacity-40 group-hover/item:opacity-70">
                                  Asset Intel
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="py-12 text-center glassmorphism rounded-xl border border-white/5 bg-white/[0.01]">
                        <div className="mx-auto w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mb-3 opacity-20">
                          <Search className="w-4 h-4 text-white" />
                        </div>
                        <h3 className="text-[8px] font-display font-bold text-muted uppercase tracking-[0.3em] opacity-20 mb-1">
                          Intelligence Gap
                        </h3>
                        <p className="text-[7px] font-mono text-muted/30 uppercase">No records match current parameters</p>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="pt-3 border-t border-white/5">
          <div className="glassmorphism p-3 rounded-xl border border-emerald-500/10 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[9px] font-display font-black text-white italic tracking-tighter uppercase">Knowledge Sync</h3>
                <p className="text-[6px] text-muted font-mono uppercase font-bold tracking-widest opacity-20">Extract Intelligence</p>
              </div>
            </div>
            
            <textarea 
              className="w-full bg-black/40 border border-white/10 p-2 rounded-lg font-mono text-[9px] min-h-[40px] outline-none focus:neon-border-emerald transition-all text-emerald-400 placeholder:text-muted/5 selection:bg-emerald-500/30"
              placeholder="Paste logs..."
              value={rawTextToSync}
              onChange={(e) => setRawTextToSync(e.target.value)}
            />
            
            <div className="flex items-center gap-1.5">
              <button 
                onClick={handleSyncData}
                disabled={(syncStatus === 'parsing' || syncStatus === 'syncing' || syncStatus === 'extracting') || (!rawTextToSync.trim() && syncStatus === 'idle')}
                className={cn(
                  "flex-1 h-8 rounded-lg px-3 flex items-center justify-center gap-1.5 font-display font-black text-[8px] uppercase tracking-widest transition-all",
                  syncStatus === 'success' ? "bg-emerald-500 text-white" : 
                  syncStatus === 'error' ? "bg-red-500/20 text-red-500 border border-red-500/20" :
                  syncStatus === 'idle' ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-emerald-900/40 text-emerald-400"
                )}
              >
                {syncStatus === 'parsing' || syncStatus === 'syncing' || syncStatus === 'extracting' ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : syncStatus === 'success' ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : syncStatus === 'error' ? (
                  <AlertCircle className="w-3 h-3" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                {syncStatus === 'idle' ? 'Sync' : 
                 syncStatus === 'parsing' ? 'Parsing' :
                 syncStatus === 'extracting' ? 'Extracting' :
                 syncStatus === 'syncing' ? 'Saving' :
                 syncStatus === 'success' ? 'Done' : 'Error'}
              </button>
              
              <input 
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={syncStatus !== 'idle' && syncStatus !== 'success' && syncStatus !== 'error'}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-50",
                  syncStatus === 'extracting' 
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.3)]" 
                    : "bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500"
                )}
                title="Extract data from photo"
              >
                {syncStatus === 'extracting' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


