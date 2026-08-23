import React, { useMemo, useState } from 'react';
import { MaintenanceRecord } from '../types';
import { calculateAuditStats, AUDIT_CATEGORIES } from '../services/auditService';
import { 
  ClipboardCheck, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Search,
  Truck,
  Wrench,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { 
  normalizePlate, 
  arePlatesSimilar,
  normalizeDate,
  deduplicateRecords,
  cn 
} from '../lib/utils';

interface FleetAuditReportProps {
  records: MaintenanceRecord[];
  fleetRegistry: string[];
  onFocusTruck: (plate: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}


export const FleetAuditReport: React.FC<FleetAuditReportProps> = ({ records, fleetRegistry, onFocusTruck, onRefresh, isRefreshing }) => {
  const [reportSearch, setReportSearch] = useState('');

  const auditData = useMemo(() => {
    const groups: Record<string, MaintenanceRecord[]> = {};
    const needsReview: MaintenanceRecord[] = [];
    const cleanRegistry = fleetRegistry.map(p => p.trim()).filter(p => p.length > 0);

    // 1. First, apply content-level deduplication to the entire record set
    const uniqueSourceRecords = deduplicateRecords(records);

    // 2. Filter for relevant years (2025-2026) as per user requirements
    const auditRecords = uniqueSourceRecords.filter(r => {
      const normalizedDate = normalizeDate(r.service_date);
      if (!normalizedDate) return false;
      const year = parseInt(normalizedDate.split('-')[0]);
      return year === 2025 || year === 2026;
    });
    
    auditRecords.forEach(record => {
      const plate = record.plate_number ? record.plate_number.toUpperCase().trim() : 'UNKNOWN';
      
      const normalizedRecordPlate = normalizePlate(plate);
      // We prioritize the registry, but we MUST ensure we don't duplicate folders
      const exactMatch = cleanRegistry.find(p => normalizePlate(p) === normalizedRecordPlate);
      const registryMatch = exactMatch || cleanRegistry.find(p => arePlatesSimilar(p, plate));
      
      if (registryMatch) {
        // Use normalized registry match as key to ensure "KCH 054T" and "KCH 054 T" don't become two folders if both are in registry
        if (!groups[registryMatch]) groups[registryMatch] = [];
        groups[registryMatch].push(record);
      } else if (cleanRegistry.length === 0) {
        // If no registry, fallback to grouping by normalized plate to avoid "KCH 054 T" vs "KCH 054T"
        const existingKey = Object.keys(groups).find(k => normalizePlate(k) === normalizedRecordPlate);
        const folderKey = existingKey || plate;
        if (!groups[folderKey]) groups[folderKey] = [];
        groups[folderKey].push(record);
      } else {
        needsReview.push(record);
      }
    });

    const folders = cleanRegistry.length > 0 ? cleanRegistry.sort() : Object.keys(groups).sort();
    
    // De-duplicate folder names just in case registry contains similar plates that normalized to same thing
    const uniqueFolders = Array.from(new Set(folders));
    
    let results = uniqueFolders.map(folder => {
      const truckRecords = groups[folder] || [];
      const stats = calculateAuditStats(truckRecords);

      return {
        plate: folder,
        isRegistry: true,
        stats
      };
    });

    // Only registry folders are displayed as per user requirements. No need to show "Needs Review" folder in audits.

    // Apply search filter
    if (reportSearch) {
      const query = reportSearch.toUpperCase().trim();
      results = results.filter(truck => truck.plate.toUpperCase().includes(query));
    }

    return results;
  }, [records, fleetRegistry, reportSearch]);

  if (records.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 px-1">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(160,32,240,0.5)]" />
            <h2 className="text-sm font-display font-black text-text uppercase tracking-[0.3em]">Fleet Audit Report</h2>
          </div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest pl-3.5">
            Live maintenance status (Scanning 2025 – 2026 Records)
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {onRefresh && (
            <button 
              type="button"
              aria-label="Sync fleet audit data"
              onClick={onRefresh}
              disabled={isRefreshing}
              className={cn(
                "w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-surface border border-border rounded-xl text-[10px] font-display font-bold text-text uppercase tracking-widest hover:bg-bg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
                isRefreshing && "opacity-50 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-purple-400", isRefreshing && "animate-spin")} aria-hidden="true" />
              {isRefreshing ? 'Syncing...' : 'Sync Data'}
            </button>
          )}

          <div className="relative group w-full md:w-80">
            <label htmlFor="fleet-audit-search" className="sr-only">Search fleet audit by plate number</label>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-30 group-focus-within:opacity-100 group-focus-within:text-purple-400 transition-all pointer-events-none" aria-hidden="true" />
            <input 
              id="fleet-audit-search"
              type="text"
              placeholder="SEARCH PLATENUMBER..."
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              className="w-full bg-black/40 border neon-border-violet rounded-full py-3.5 pl-12 pr-6 text-sm font-display font-medium text-text placeholder:text-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus:bg-black/60 transition-all uppercase tracking-widest shadow-[0_0_15px_rgba(160,32,240,0.1)]"
            />
          </div>
      </div>
    </div>

      {/* Grid of Report Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {auditData.map((truck) => (
          <div 
            key={truck.plate}
            className="group relative bg-surface border border-border rounded-3xl overflow-hidden hover:border-purple-500/30 transition-colors"
          >
            <div className="p-4 sm:p-5">
              {/* Truck Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl border flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner",
                    truck.isRegistry ? "bg-purple-500/10 border-purple-500/20" : "bg-amber-500/10 border-amber-500/20"
                  )}>
                    <Truck className={cn("w-5 h-5", truck.isRegistry ? "text-purple-600 dark:text-purple-400" : "text-amber-600 dark:text-amber-400")} />
                  </div>
                  <div>
                    <h3 className="text-base font-display font-bold text-text tracking-tight leading-tight">{truck.plate}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        truck.isRegistry ? "bg-green-500" : "bg-amber-500"
                      )} />
                      <span className="text-[8px] font-mono text-muted uppercase tracking-widest">
                        {truck.isRegistry ? "Verified" : "Sync Required"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Grid */}
              <div className="grid grid-cols-2 gap-2">
                {truck.stats.map((stat) => (
                  <div 
                    key={stat.catId}
                    className={cn(
                      "p-2.5 rounded-xl border transition-colors relative overflow-hidden group/stat",
                      stat.isCritical 
                        ? "bg-red-500/10 border-red-500/20" 
                        : stat.isStale 
                          ? "bg-amber-500/5 border-amber-500/20" 
                          : stat.latestDate 
                            ? (stat.catId === 'battery_repair' ? "bg-blue-500/10 border-blue-500/20" : "bg-green-500/5 border-green-500/20")
                            : "bg-surface border-border opacity-40 shrink-0"
                    )}
                  >
                    {/* Progress Bar Background */}
                    {stat.latestDate && (
                      <div 
                        className={cn(
                          "absolute bottom-0 left-0 h-0.5",
                          stat.isCritical ? "bg-red-500" : stat.isStale ? "bg-amber-500" : (stat.catId === 'battery_repair' ? "bg-blue-500" : "bg-green-500")
                        )}
                        style={{ width: `${stat.remainingPercent}%` }}
                      />
                    )}

                    <div className="flex items-center justify-between mb-2">
                       <span className="text-[8px] font-display font-bold uppercase tracking-widest opacity-40">{stat.label}</span>
                       {stat.isCritical ? (
                         <AlertTriangle className={cn("w-2.5 h-2.5 text-red-500")} />
                       ) : stat.isStale ? (
                         <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                       ) : stat.latestDate ? (
                         stat.catId === 'battery_repair' ? <CheckCircle2 className="w-2.5 h-2.5 text-blue-500" /> : <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
                       ) : (
                         <div className="w-2.5 h-2.5 rounded-full border border-current opacity-20" />
                       )}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn(
                          "text-[10px] font-mono font-bold tracking-tight shrink-0",
                          stat.latestDate ? "text-text" : "text-red-500/40"
                        )}>
                          {stat.latestDate ? stat.latestDate : "NO DATA"}
                        </span>
                        {stat.latestDate && (
                          <span className={cn(
                            "text-[8px] font-mono font-bold",
                            stat.isCritical ? "text-red-400" : stat.isStale ? "text-amber-400" : (stat.catId === 'battery_repair' ? "text-blue-400" : "text-green-400")
                          )}>
                            {stat.remainingPercent}%
                          </span>
                        )}
                      </div>
                      {stat.latestDate ? (
                        <div className="flex items-center justify-between mt-0.5">
                          <span className={cn(
                            "text-[8px] font-mono uppercase",
                            stat.isCritical ? "text-red-500/60" : stat.isStale ? "text-amber-500/60" : (stat.catId === 'battery_repair' ? "text-blue-500/60" : "text-green-500/60")
                          )}>
                            {stat.timeAgo}
                          </span>
                          <span className="text-[7px] font-mono opacity-0 group-hover/stat:opacity-40 transition-opacity uppercase tracking-tighter">Remaining</span>
                        </div>
                      ) : (
                        <div className="mt-0.5">
                          <span className="text-[8px] font-mono uppercase text-red-500/40">Audit Failure</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="p-8 text-center bg-surface border border-border border-dashed rounded-[2rem]">
        <div className="inline-flex items-center gap-3 px-4 py-2 bg-surface rounded-full border border-border mb-4">
          <ClipboardCheck className="w-3.5 h-3.5 text-purple-400" strokeWidth={3} />
          <span className="text-[9px] font-display font-bold text-muted uppercase tracking-[0.2em]">Audit Logic Powered by DT.Base Engine</span>
        </div>
        <p className="text-[10px] text-muted/40 leading-relaxed uppercase tracking-widest max-w-sm mx-auto">
          Status colors: Green (Recent), Yellow (Due Soon), Red (Critical/Overdue). 
          Timelines vary by component (5–12 months). Red line is reached at 13 months for all categories.
        </p>
      </div>
    </div>
  );
};
