import React, { useState, useMemo } from 'react';
import { Search, Hash, Tag, AlignLeft, Layers, Database, ChevronRight, Calendar, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { MaintenanceRecord } from '../types';

interface AdvancedSearchProps {
  records: MaintenanceRecord[];
}

export function AdvancedSearch({ records }: AdvancedSearchProps) {
  const [plateQuery, setPlateQuery] = useState('');
  const [keywordQuery, setKeywordQuery] = useState('');
  const [fullTextQuery, setFullTextQuery] = useState('');
  const [positionQuery, setPositionQuery] = useState('');

  const filteredResults = useMemo(() => {
    if (!records) return [];
    
    const p = plateQuery.toLowerCase().trim();
    const k = keywordQuery.toLowerCase().trim();
    const f = fullTextQuery.toLowerCase().trim();
    const s = positionQuery.toLowerCase().trim();

    const isSearchActive = p || k || f || s;
    if (!isSearchActive) return [];

    return records.filter(record => {
      const matchesPlate = !p || record.plate_number.toLowerCase().includes(p);
      const matchesKeyword = !k || record.service_description.toLowerCase().includes(k);
      const matchesFullText = !f || (
        record.plate_number.toLowerCase().includes(f) || 
        record.service_description.toLowerCase().includes(f) ||
        (record.amount || 0).toString().includes(f)
      );
      const matchesPosition = !s || record.service_description.toLowerCase().includes(s);

      return matchesPlate && matchesKeyword && matchesFullText && matchesPosition;
    }).sort((a, b) => new Date(b.service_date).getTime() - new Date(a.service_date).getTime());
  }, [records, plateQuery, keywordQuery, fullTextQuery, positionQuery]);

  // Limit rendering to prevent browser freeze
  const visibleResults = useMemo(() => filteredResults.slice(0, 100), [filteredResults]);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shadow-inner backdrop-blur-xl">
            <Database className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-display font-black text-white uppercase tracking-tighter leading-none">Advanced Intelligence Search</h2>
            <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em] mt-1">Cross-Reference Surgical Extraction</p>
          </div>
        </div>
        
        {/* Rapid Status */}
        <div className="flex items-center gap-3 px-4 py-2 bg-black/40 border border-white/5 rounded-2xl backdrop-blur-md">
          <div className="flex flex-col">
            <span className="text-[7px] font-display font-black text-white/20 uppercase tracking-widest leading-none">Status</span>
            <span className="text-[9px] font-display font-black text-purple-400 uppercase tracking-widest leading-none mt-1">Active Engine</span>
          </div>
          <div className="w-px h-6 bg-white/5" />
          <div className="flex flex-col text-right">
            <span className="text-[7px] font-display font-black text-white/20 uppercase tracking-widest leading-none">Scope</span>
            <span className="text-[9px] font-display font-black text-white/60 uppercase tracking-widest leading-none mt-1">{records.length} Logs</span>
          </div>
        </div>
      </div>

      {/* Search Console */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Plate Number */}
        <div className="flex flex-col gap-2">
          <label htmlFor="adv-search-plate" className="text-[10px] font-display font-bold text-white/60 uppercase tracking-widest ml-1">Plate Number</label>
          <div className="group relative">
            <div className="absolute -inset-0.5 bg-purple-500/10 rounded-2xl blur-sm opacity-0 group-focus-within:opacity-100 transition-all" />
            <div className="relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Hash className="w-3.5 h-3.5 text-white/20 group-focus-within:text-purple-400 transition-colors" />
              </div>
              <input
                id="adv-search-plate"
                type="text"
                value={plateQuery}
                onChange={(e) => setPlateQuery(e.target.value)}
                placeholder="Enter plate..."
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-11 pr-6 text-xs font-medium text-white placeholder:text-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus:border-purple-500/50 transition-all uppercase tracking-wider backdrop-blur-md"
              />
            </div>
          </div>
        </div>

        {/* Maintenance Keyword */}
        <div className="flex flex-col gap-2">
          <label htmlFor="adv-search-keyword" className="text-[10px] font-display font-bold text-white/60 uppercase tracking-widest ml-1">Maintenance Keyword</label>
          <div className="group relative">
            <div className="absolute -inset-0.5 bg-purple-500/10 rounded-2xl blur-sm opacity-0 group-focus-within:opacity-100 transition-all" />
            <div className="relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Tag className="w-3.5 h-3.5 text-white/20 group-focus-within:text-purple-400 transition-colors" />
              </div>
              <input
                id="adv-search-keyword"
                type="text"
                value={keywordQuery}
                onChange={(e) => setKeywordQuery(e.target.value)}
                placeholder="Service type..."
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-11 pr-6 text-xs font-medium text-white placeholder:text-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus:border-purple-500/50 transition-all uppercase tracking-wider backdrop-blur-md"
              />
            </div>
          </div>
        </div>

        {/* Full Text Search */}
        <div className="flex flex-col gap-2">
          <label htmlFor="adv-search-fulltext" className="text-[10px] font-display font-bold text-white/60 uppercase tracking-widest ml-1">Full Text Search</label>
          <div className="group relative">
            <div className="absolute -inset-0.5 bg-purple-500/10 rounded-2xl blur-sm opacity-0 group-focus-within:opacity-100 transition-all" />
            <div className="relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <AlignLeft className="w-3.5 h-3.5 text-white/20 group-focus-within:text-purple-400 transition-colors" />
              </div>
              <input
                id="adv-search-fulltext"
                type="text"
                value={fullTextQuery}
                onChange={(e) => setFullTextQuery(e.target.value)}
                placeholder="Search anything..."
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-11 pr-6 text-xs font-medium text-white placeholder:text-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus:border-purple-500/50 transition-all uppercase tracking-wider backdrop-blur-md"
              />
            </div>
          </div>
        </div>

        {/* Position or Side */}
        <div className="flex flex-col gap-2">
          <label htmlFor="adv-search-position" className="text-[10px] font-display font-bold text-white/60 uppercase tracking-widest ml-1">Position or Side</label>
          <div className="group relative">
            <div className="absolute -inset-0.5 bg-purple-500/10 rounded-2xl blur-sm opacity-0 group-focus-within:opacity-100 transition-all" />
            <div className="relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Layers className="w-3.5 h-3.5 text-white/20 group-focus-within:text-purple-400 transition-colors" />
              </div>
              <input
                id="adv-search-position"
                type="text"
                value={positionQuery}
                onChange={(e) => setPositionQuery(e.target.value)}
                placeholder="Left/Right/Front..."
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-11 pr-6 text-xs font-medium text-white placeholder:text-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus:border-purple-500/50 transition-all uppercase tracking-wider backdrop-blur-md"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <h3 className="text-[10px] font-display font-black text-purple-400 uppercase tracking-[0.3em]">Intelligence Matches</h3>
          <div className="bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
            <span className="text-[9px] font-mono text-purple-400/80 font-bold tracking-tighter">
              {filteredResults.length} FOUND {filteredResults.length > 100 && "(TOP 100)"}
            </span>
          </div>
        </div>
        {(plateQuery || keywordQuery || fullTextQuery || positionQuery) && (
          <button 
            type="button"
            onClick={() => {
              setPlateQuery('');
              setKeywordQuery('');
              setFullTextQuery('');
              setPositionQuery('');
            }}
            className="text-[9px] font-display font-black text-white/20 uppercase tracking-[0.2em] hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded px-1 transition-colors"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Results Grid */}
      <div className="space-y-3">
        {visibleResults.length > 0 ? (
          visibleResults.map((record, idx) => (
            <div
              key={record.id || `${record.plate_number}-${idx}`}
              className="group/item relative bg-black/40 border border-white/5 p-4 rounded-[2rem] hover:border-purple-500/40 hover:bg-black/60 transition-all backdrop-blur-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-black/60 flex flex-col items-center justify-center border border-white/10 shadow-inner group-hover/item:border-purple-500/20 transition-colors">
                    <span className="text-[8px] font-display font-black text-purple-400 uppercase tracking-tighter leading-none mb-1">
                      {new Date(record.service_date).toLocaleString('default', { month: 'short' })}
                    </span>
                    <span className="text-xl font-display font-black text-white leading-none">
                      {new Date(record.service_date).getDate()}
                    </span>
                    <span className="text-[7px] font-mono text-white/20 uppercase font-black leading-none mt-1">
                      {new Date(record.service_date).getFullYear()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-purple-500/10 border border-purple-500/20 text-purple-400 px-2.5 py-0.5 rounded-lg text-xs font-display font-black tracking-widest shadow-[0_0_10px_rgba(160,32,240,0.1)]">
                        {record.plate_number}
                      </span>
                      <div className="flex items-center gap-1.5 opacity-20 group-hover/item:opacity-50 transition-opacity">
                        <Calendar className="w-3 h-3" />
                        <span className="text-[9px] font-mono uppercase tracking-[0.2em] font-bold">Historical Record</span>
                      </div>
                    </div>
                    <h4 className="text-sm font-display font-bold text-white uppercase tracking-tight group-hover/item:text-purple-100 transition-colors leading-tight">
                      {record.service_description}
                    </h4>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-center gap-1.5 pl-18 sm:pl-0 border-t border-white/5 sm:border-0 pt-3 sm:pt-0">
                  <div className="text-[10px] font-display font-black text-white/20 uppercase tracking-widest mb-0.5">Asset Value</div>
                  <div className="text-2xl font-display font-black text-white tracking-tighter leading-none group-hover/item:text-purple-400 transition-colors">
                    <span className="text-sm mr-1 text-purple-400/30 font-mono font-bold">{record.currency || 'KES'}</span>
                    {(record.amount || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="py-20 text-center">
            <p className="text-[10px] font-mono text-white/20 uppercase tracking-[0.3em]">
              {!(plateQuery.trim() || keywordQuery.trim() || fullTextQuery.trim() || positionQuery.trim()) 
                ? "Empty before search" 
                : "No matching results found"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
