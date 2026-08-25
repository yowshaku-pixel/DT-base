import React, { useState, useMemo, useEffect } from 'react';
import { MarketPrice, PaymentRecord } from '../types';
import { 
  Tag, Search, Shield, Zap, TrendingUp, ArrowUpRight, 
  MapPin, Clock, Globe, Filter, ExternalLink, Info,
  Receipt, TrendingDown, Calendar, Truck, 
  ArrowDownRight, DollarSign, Wallet, 
  Download, PieChart, Database, RefreshCw, AlertCircle, CheckCircle2, X, Plus, Terminal, Camera, Image as ImageIcon,
  Activity, Eye, EyeOff
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
  currency TEXT DEFAULT 'KES',
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
  const { priceSearchResults, latestMarketResult } = useMemo(() => {
    if (!priceQuery.trim()) return { priceSearchResults: [], latestMarketResult: null };
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
      
      // Heuristic: Keep the one with the most recent date
      if (!existing || new Date(item.service_date) > new Date(existing.service_date)) {
        uniqueItems.set(normalizedDesc, item);
      }
    });

    const results = Array.from(uniqueItems.values()).sort((a, b) => b.amount - a.amount);
    
    // Latest result for this search (by date)
    const latest = results.length > 0 
      ? [...results].sort((a, b) => new Date(b.service_date).getTime() - new Date(a.service_date).getTime())[0]
      : null;

    return { priceSearchResults: results, latestMarketResult: latest };
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
              currency: r.currency || 'KES',
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
      <div className="flex flex-col items-center justify-center p-20 glassmorphism rounded-3xl border border-purple-500/20 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
        <Globe className="w-10 h-10 text-purple-500 mb-6 animate-pulse" />
        <h2 className="text-xl font-display font-black text-white mb-2 uppercase tracking-tighter">IntelCenter Restricted</h2>
        <p className="text-[10px] font-mono text-muted uppercase tracking-[0.2em] mb-6 opacity-40">Authorization Required for Fleet Intelligence</p>
        <button 
          onClick={onUnlockRequest} 
          className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-display font-black uppercase tracking-[0.3em] text-[10px] shadow-lg shadow-purple-900/40 transition-all active:scale-95"
        >
          Decrypt Access
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8 max-w-2xl mx-auto">
      <div className="text-center space-y-1 mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full mb-2">
          <Database className="w-3 h-3 text-purple-400" />
          <span className="text-[8px] font-display font-black text-purple-400 uppercase tracking-[0.3em]">Operational Module</span>
        </div>
        <h1 className="text-2xl md:text-5xl font-display font-black text-white tracking-tighter uppercase leading-[0.8]">
          Intel<span className="text-purple-500">Center</span>
        </h1>
        <p className="text-muted text-[8px] uppercase tracking-[0.4em] font-bold opacity-30">
          Integrated Fleet Intelligence Engine
        </p>
      </div>

      {/* THREE SEARCH BARS */}
      <div className="space-y-4 px-2">
        {/* 1. Plate Search */}
        <div className="flex flex-col gap-2">
          <label htmlFor="intel-plate-search" className="text-[10px] font-display font-bold text-white/60 uppercase tracking-widest ml-1">Primary Target</label>
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl blur-sm opacity-5 group-hover:opacity-20 transition-all" />
            <div className="relative bg-black/60 rounded-2xl border border-white/10 p-2.5 flex items-center gap-3 hover:border-purple-500/40 transition-all backdrop-blur-xl">
              <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center border border-purple-500/20 flex-shrink-0 shadow-inner" aria-hidden="true">
                <Truck className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex-1">
                <input 
                  id="intel-plate-search"
                  type="text"
                  placeholder="VEHICLE PLATE..."
                  className="w-full bg-transparent border-none outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-lg font-medium text-sm text-white placeholder:text-white/20 leading-none uppercase tracking-tight"
                  value={plateQuery}
                  onChange={(e) => setPlateQuery(e.target.value)}
                />
              </div>
              {plateQuery && (
                <button
                  type="button"
                  aria-label="Clear vehicle plate search"
                  onClick={() => setPlateQuery('')}
                  className="p-2 hover:bg-white/5 rounded-full text-muted/30 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 2. Keyword Search */}
        <div className="flex flex-col gap-2">
          <label htmlFor="intel-keyword-search" className="text-[10px] font-display font-bold text-white/60 uppercase tracking-widest ml-1">Intelligence Keyword</label>
          <div className="relative group">
            <div className={cn(
              "relative bg-black/40 rounded-2xl border border-white/5 p-2.5 flex items-center gap-3 transition-all backdrop-blur-md",
              !plateQuery ? "opacity-30 grayscale" : "hover:border-amber-500/30 group-hover:bg-black/60"
            )}>
              <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/20 flex-shrink-0" aria-hidden="true">
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex-1">
                <input 
                  id="intel-keyword-search"
                  type="text"
                  placeholder="COMPONENT REFERENCE..."
                  className="w-full bg-transparent border-none outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-lg font-medium text-sm text-white placeholder:text-white/20 leading-none uppercase tracking-tight"
                  value={keywordQuery}
                  onChange={(e) => setKeywordQuery(e.target.value)}
                  disabled={!plateQuery}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Price Search */}
        <div className="flex flex-col gap-2">
          <label htmlFor="intel-price-search" className="text-[10px] font-display font-bold text-white/60 uppercase tracking-widest ml-1">Market Analysis</label>
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-violet-600 rounded-2xl blur-sm opacity-0 group-hover:opacity-10 transition-all" />
            <div className="relative bg-black/40 rounded-2xl border border-white/5 p-2.5 flex items-center gap-3 hover:border-purple-500/40 transition-all backdrop-blur-md">
              <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center border border-purple-500/20 flex-shrink-0" aria-hidden="true">
                <TrendingUp className="w-4 h-4 text-purple-500" />
              </div>
              <div className="flex-1">
                <input 
                  id="intel-price-search"
                  type="text"
                  placeholder="PRICE REFERENCE..."
                  className="w-full bg-transparent border-none outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-lg font-medium text-sm text-white placeholder:text-white/20 leading-none uppercase tracking-tight"
                  value={priceQuery}
                  onChange={(e) => {
                    setPriceQuery(e.target.value);
                    setShowPriceResults(false);
                  }}
                />
              </div>
              <button 
                type="button"
                onClick={() => priceQuery.trim() && setShowPriceResults(true)}
                className={cn(
                  "h-10 px-4 rounded-xl font-display font-black text-[10px] uppercase tracking-widest transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
                  priceQuery.trim() ? "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/20" : "bg-white/5 text-white/20 cursor-not-allowed"
                )}
              >
                Scan
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RESULTS AREA */}
      <div className="space-y-4 px-2">
        {/* Latest High-Confidence Result */}
        {plateQuery && keywordFilteredItems.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glassmorphism p-4 rounded-[2rem] border-2 border-purple-500/40 bg-purple-500/5 shadow-[0_0_40px_rgba(160,32,240,0.1)] relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Zap className="w-12 h-12 text-purple-500" />
            </div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-500 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(160,32,240,0.5)] transition-transform group-hover:scale-110">
                  <Activity className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-xs font-display font-black text-white tracking-tighter uppercase">Primary Intelligence</h3>
                  <p className="text-[7px] font-mono text-purple-400/60 uppercase tracking-[0.2em] font-bold">Top Verified Match</p>
                </div>
              </div>
              <div className="bg-purple-600/20 px-3 py-1 rounded-full border border-purple-500/30">
                <span className="text-[8px] font-mono text-purple-400 font-black uppercase tracking-[0.2em] animate-pulse">Live</span>
              </div>
            </div>
            <div className="flex items-end justify-between">
              <div className="flex-1 min-w-0">
                <span className="text-[9px] font-display font-black text-purple-400 uppercase tracking-widest bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 inline-block mb-2">
                  {keywordFilteredItems[0].plate}
                </span>
                <h4 className="text-lg font-display font-black text-white leading-[1.1] uppercase truncate pr-4">
                  {keywordFilteredItems[0].description}
                </h4>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[8px] font-mono text-white/30 uppercase font-bold tracking-[0.2em]">{new Date(keywordFilteredItems[0].service_date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-display font-black text-purple-400/50 mb-1 uppercase tracking-widest">Calculated Cost</div>
                <div className="text-3xl font-display font-black text-purple-400 leading-none tracking-tighter">
                  <span className="text-sm mr-1 opacity-30 font-mono">KES</span>
                  {keywordFilteredItems[0].amount.toLocaleString()}
                </div>
              </div>
            </div>
          </motion.div>
        )}


        {/* Latest Market IQ Result (for price searches) */}
        {!plateQuery && showPriceResults && latestMarketResult && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glassmorphism p-3 rounded-2xl border-2 border-purple-500/40 bg-purple-500/5 shadow-[0_0_30px_rgba(160,32,240,0.1)] relative overflow-hidden group mb-2"
          >
            <div className="absolute top-0 right-0 p-2 opacity-5">
              <Globe className="w-8 h-8 text-purple-500" />
            </div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-purple-500 rounded-lg flex items-center justify-center shadow-[0_0_10px_rgba(160,32,240,0.5)]">
                  <Zap className="w-3 h-3 text-white" />
                </div>
                <h3 className="text-[10px] font-display font-black text-white tracking-tighter uppercase">Latest Market IQ</h3>
              </div>
              <div className="bg-purple-600/20 px-2 py-0.5 rounded-full border border-purple-500/30">
                <span className="text-[7px] font-mono text-purple-400 font-bold uppercase tracking-widest animate-pulse">Live Intel</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-display font-black text-white leading-tight uppercase truncate">
                  {latestMarketResult.description}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[8px] font-mono text-white/40 uppercase font-bold tracking-widest">{new Date(latestMarketResult.service_date).toLocaleDateString()}</span>
                  <span className="text-white/10">•</span>
                  <p className="text-[8px] font-display font-bold text-purple-400 uppercase tracking-widest">{latestMarketResult.plate}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-lg font-display font-black text-purple-400 leading-none">
                  <span className="text-[9px] mr-1 opacity-50">KES</span>
                  {latestMarketResult.amount.toLocaleString()}
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
              <div className="glassmorphism p-2 rounded-xl border border-purple-500/30 bg-purple-950/20 space-y-1.5 shadow-[0_0_20px_rgba(160,32,240,0.05)]">
                <div className="flex items-center justify-between border-b border-white/5 pb-1">
                  <h3 className="text-[7px] font-display font-black text-purple-400 uppercase tracking-widest flex items-center gap-1.5">
                    <TrendingDown className="w-2.5 h-2.5" />
                    Internal Price Reference
                  </h3>
                  <button
                    type="button"
                    aria-label="Close price results"
                    onClick={() => setShowPriceResults(false)}
                    className="p-1 hover:bg-white/5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 hover:text-white transition-colors"
                  >
                    <X className="w-2.5 h-2.5 text-muted" />
                  </button>
                </div>
                
                {priceSearchResults.length > 0 ? (
                  <div className="grid grid-cols-1 gap-1">
                    {priceSearchResults.slice(0, 8).map((res, i) => (
                      <div key={i} className="flex items-center justify-between p-1.5 rounded bg-black/40 border border-white/5 group/ref">
                        <div className="flex flex-col">
                          <span className="text-[8px] text-white/90 font-bold truncate max-w-[150px] group-hover/ref:text-purple-400 transition-colors uppercase">{res.description}</span>
                          <div className="flex items-center gap-1 opacity-20">
                            <span className="text-[5px] text-muted font-mono uppercase">{res.plate}</span>
                            <span className="text-[5px] text-muted font-mono">•</span>
                            <span className="text-[5px] text-muted font-mono">{new Date(res.service_date).getFullYear()}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-display font-black text-purple-400">
                            {res.amount.toLocaleString()} 
                            <span className="text-[6px] ml-0.5 opacity-40">KES</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 opacity-40">
                    <div className="text-[7px] font-display font-bold uppercase tracking-widest text-emerald-500/50 mb-1">Low Intelligence Confidence</div>
                    <p className="text-[6px] text-white/20 font-mono">No clear reference data found</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Plate Results List */}
        {plateQuery && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  aria-expanded={showResultsList}
                  aria-label={showResultsList ? "Hide fleet intelligence list" : "Show fleet intelligence list"}
                  onClick={() => setShowResultsList(!showResultsList)}
                  className={cn(
                    "flex items-center gap-2 group/toggle transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded p-0.5",
                    !showResultsList && "opacity-50"
                  )}
                >
                  <h2 className="text-[9px] font-display font-black text-white tracking-tighter uppercase flex items-center gap-1.5">
                    <Database className="w-2.5 h-2.5 text-blue-500" />
                    Fleet Intelligence
                  </h2>
                  <div className="w-4 h-4 rounded-full bg-white/5 flex items-center justify-center group-hover/toggle:bg-white/10 transition-colors" aria-hidden="true">
                    {showResultsList ? (
                      <Eye className="w-2 h-2 text-white/40" />
                    ) : (
                      <EyeOff className="w-2 h-2 text-white/40" />
                    )}
                  </div>
                </button>
                
                {keywordFilteredItems.length > 0 && showResultsList && (
                  <div className="flex items-center gap-1 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                    <span className="text-[7px] font-display font-black text-purple-400">
                      KES {keywordFilteredItems.reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-[6px] font-mono text-muted uppercase tracking-[0.2em] font-bold opacity-30">
                {keywordFilteredItems.length} Entries
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
                            <h4 className="text-[8px] font-display font-black text-red-100 uppercase tracking-widest">Sync Error</h4>
                            <p className="text-[7px] text-red-200/30 font-mono uppercase truncate">DB Connectivity issue</p>
                          </div>
                          <button 
                            type="button"
                            aria-label="Retry loading ledger items"
                            onClick={loadLedger} 
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
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
                              "p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 group/item",
                              idx === 0 && plateQuery ? "bg-purple-600/5 border-purple-500/40 shadow-[0_0_30px_rgba(160,32,240,0.05)]" : "bg-black/30 border-white/5 hover:border-purple-500/30 hover:bg-black/50"
                            )}>
                              <div className="flex items-center gap-4">
                                {/* 1. Date Segment */}
                                <div className={cn(
                                  "w-12 h-12 rounded-xl flex flex-col items-center justify-center border transition-all shadow-inner backdrop-blur-md",
                                  idx === 0 && plateQuery ? "bg-purple-500/10 border-purple-500/30" : "bg-white/5 border-white/10"
                                )}>
                                  <div className={cn(
                                    "text-[7px] font-display font-black uppercase tracking-tighter leading-none mb-0.5",
                                    idx === 0 && plateQuery ? "text-purple-400" : "text-white/30"
                                  )}>
                                    {new Date(item.service_date).toLocaleString('default', { month: 'short' })}
                                  </div>
                                  <div className="text-base font-display font-black text-white leading-none">
                                    {new Date(item.service_date).getDate()}
                                  </div>
                                  <div className="text-[6px] font-mono text-white/20 uppercase leading-none mt-1 font-bold">
                                    {new Date(item.service_date).getFullYear()}
                                  </div>
                                </div>

                                {/* 2. Info Segment */}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <span className={cn(
                                      "px-2 py-0.5 border rounded-lg text-[10px] font-display font-black tracking-widest leading-none shadow-sm",
                                      idx === 0 && plateQuery ? "bg-purple-500/20 border-purple-500/40 text-purple-300 shadow-purple-500/20" : "bg-white/5 border-white/10 text-white/50"
                                    )}>
                                      {item.plate}
                                    </span>
                                    {idx === 0 && plateQuery && (
                                      <span className="text-[7px] font-display font-black text-purple-400 uppercase tracking-[0.2em] animate-pulse">Live</span>
                                    )}
                                    {item.verified && (
                                      <div className="flex items-center gap-1 bg-emerald-500/10 px-1.5 rounded-full border border-emerald-500/20">
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                                        <span className="text-[6px] font-mono text-emerald-400 font-black uppercase tracking-widest">Verified</span>
                                      </div>
                                    )}
                                  </div>
                                  <h4 className="text-xs font-display font-bold text-white uppercase tracking-tight line-clamp-1 group-hover/item:text-purple-100 transition-all leading-tight">
                                    {item.description}
                                  </h4>
                                </div>
                              </div>

                              {/* 3. Action/Value Segment */}
                              <div className="text-right flex-shrink-0">
                                <div className="text-[8px] font-display font-black text-white/20 uppercase tracking-[0.2em] mb-1">Impact Value</div>
                                <div className="text-lg font-display font-black text-white tracking-tighter leading-none flex items-baseline gap-0.5 justify-end group-hover/item:text-purple-400 transition-all">
                                  <span className="text-[9px] opacity-30 font-mono font-bold mr-0.5">KES</span>
                                  {item.amount.toLocaleString()}
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
        )}

        <div className="pt-3 border-t border-white/5">
          <div className="glassmorphism p-3 rounded-xl border border-emerald-500/10 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[9px] font-display font-black text-white tracking-tighter uppercase">Knowledge Sync</h3>
                <p className="text-[6px] text-muted font-mono uppercase font-bold tracking-widest opacity-20">Extract Intelligence</p>
              </div>
            </div>
            
            <label htmlFor="intel-knowledge-sync-logs" className="sr-only">Paste maintenance logs for Knowledge Sync</label>
            <textarea 
              id="intel-knowledge-sync-logs"
              className="w-full bg-black/40 border border-white/10 p-2 rounded-lg font-mono text-[9px] min-h-[40px] outline-none focus:neon-border-emerald focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all text-emerald-400 placeholder:text-muted/5 selection:bg-emerald-500/30"
              placeholder="Paste logs..."
              value={rawTextToSync}
              onChange={(e) => setRawTextToSync(e.target.value)}
            />
            
            <div className="flex items-center gap-1.5">
              <button 
                type="button"
                onClick={handleSyncData}
                disabled={(syncStatus === 'parsing' || syncStatus === 'syncing' || syncStatus === 'extracting') || (!rawTextToSync.trim() && syncStatus === 'idle')}
                className={cn(
                  "flex-1 h-8 rounded-lg px-3 flex items-center justify-center gap-1.5 font-display font-black text-[8px] uppercase tracking-widest transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
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
                type="button"
                aria-label="Extract maintenance data from photo"
                onClick={() => fileInputRef.current?.click()}
                disabled={syncStatus !== 'idle' && syncStatus !== 'success' && syncStatus !== 'error'}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
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


