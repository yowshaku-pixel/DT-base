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
  ArrowRight
} from 'lucide-react';
import { 
  normalizePlate, 
  arePlatesSimilar,
  normalizeDate,
  cn 
} from '../lib/utils';

interface FleetAuditReportProps {
  records: MaintenanceRecord[];
  fleetRegistry: string[];
  onFocusTruck: (plate: string) => void;
}


export const FleetAuditReport: React.FC<FleetAuditReportProps> = ({ records, fleetRegistry, onFocusTruck }) => {
  const [reportSearch, setReportSearch] = useState('');

  const auditData = useMemo(() => {
    const groups: Record<string, MaintenanceRecord[]> = {};
    const needsReview: MaintenanceRecord[] = [];
    const cleanRegistry = fleetRegistry.map(p => p.trim()).filter(p => p.length > 0);

    // Grouping logic identical to App.tsx for consistency
    // User Request: Skip anything before 2025 as it is considered outdated or wrong.
    const auditRecords = records.filter(r => {
      const normalizedDate = normalizeDate(r.service_date);
      if (!normalizedDate) return false;
      const year = parseInt(normalizedDate.split('-')[0]);
      // User Request: loop and find a record in 2025 and 2026. Ignore anything else (typos like 2004).
      return year === 2025 || year === 2026;
    });
    
    auditRecords.forEach(record => {
      const plate = record.plate_number ? record.plate_number.toUpperCase().trim() : 'UNKNOWN';
      
      const normalizedRecordPlate = normalizePlate(plate);
      const exactMatch = cleanRegistry.find(p => normalizePlate(p) === normalizedRecordPlate);
      const registryMatch = exactMatch || cleanRegistry.find(p => arePlatesSimilar(p, plate));
      
      if (registryMatch) {
        if (!groups[registryMatch]) groups[registryMatch] = [];
        groups[registryMatch].push(record);
      } else if (cleanRegistry.length === 0) {
        if (!groups[plate]) groups[plate] = [];
        groups[plate].push(record);
      } else {
        needsReview.push(record);
      }
    });

    const folders = cleanRegistry.length > 0 ? cleanRegistry.sort() : Object.keys(groups).sort();
    
    let results = folders.map(folder => {
      const truckRecords = groups[folder] || [];
      const stats = calculateAuditStats(truckRecords);

      return {
        plate: folder,
        isRegistry: true,
        stats
      };
    });

    // Add "Needs Review" group if there are records that don't match any folder
    if (needsReview.length > 0) {
      const stats = calculateAuditStats(needsReview);
      
      results.unshift({
        plate: '⚠️ NEEDS REVIEW',
        isRegistry: false,
        stats
      });
    }

    // Apply search filter
    if (reportSearch) {
      const query = reportSearch.toUpperCase().trim();
      results = results.filter(truck => truck.plate.toUpperCase().includes(query));
    }

    return results;
  }, [records, fleetRegistry, reportSearch]);

  if (records.length === 0) return null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 px-1">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-cyan-500 rounded-full" />
            <h2 className="text-sm font-display font-bold text-white uppercase tracking-[0.3em]">Fleet Audit Report</h2>
          </div>
          <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest pl-3.5">
            Live maintenance status (Scanning 2025 – 2026 Records)
          </p>
        </div>

        <div className="relative group w-full md:w-64">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-30 group-focus-within:opacity-100 group-focus-within:text-cyan-400 transition-all" />
          <input 
            type="text"
            placeholder="FIND TRUCK..."
            value={reportSearch}
            onChange={(e) => setReportSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-[10px] font-mono font-bold uppercase tracking-widest text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-500/50 focus:bg-white/[0.08] transition-all"
          />
        </div>
      </div>

      {/* Grid of Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {auditData.map((truck) => (
          <div 
            key={truck.plate}
            className="group relative bg-white/[0.03] border border-white/10 rounded-[2rem] overflow-hidden hover:bg-white/[0.06] hover:border-cyan-500/30 transition-all duration-500"
          >
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-[60px] -mr-16 -mt-16 group-hover:bg-cyan-500/10 transition-all" />
            
            <div className="p-6">
              {/* Truck Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl border flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-500",
                    truck.isRegistry ? "bg-cyan-500/10 border-cyan-500/20" : "bg-amber-500/10 border-amber-500/20"
                  )}>
                    <Truck className={cn("w-6 h-6", truck.isRegistry ? "text-cyan-400" : "text-amber-400")} />
                  </div>
                  <div>
                    <h3 className="text-xl font-display font-bold text-white tracking-tight leading-tight">{truck.plate}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full animate-pulse",
                        truck.isRegistry ? "bg-green-500" : "bg-amber-500"
                      )} />
                      <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
                        {truck.isRegistry ? "Verified Fleet Folder" : "System Review Group"}
                      </span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => onFocusTruck(truck.plate)}
                  className={cn(
                    "p-2.5 bg-white/5 rounded-xl border border-white/10 text-white/40 transition-all",
                    truck.isRegistry ? "hover:text-cyan-400 hover:border-cyan-400/30 hover:bg-cyan-400/10" : "hover:text-amber-400 hover:border-amber-400/30 hover:bg-amber-400/10"
                  )}
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Status Grid */}
              <div className="grid grid-cols-2 gap-3">
                {truck.stats.map((stat) => (
                  <div 
                    key={stat.catId}
                    className={cn(
                      "p-3 rounded-2xl border transition-all duration-300 relative overflow-hidden group/stat",
                      stat.latestDate 
                        ? (stat.isCritical 
                            ? "bg-red-500/10 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]" 
                            : stat.isStale 
                                ? "bg-amber-500/5 border-amber-500/20" 
                                : "bg-green-500/5 border-green-500/20")
                        : "bg-red-500/[0.03] border-red-500/10 grayscale opacity-40 shrink-0"
                    )}
                  >
                    {/* Progress Bar Background */}
                    {stat.latestDate && (
                      <div 
                        className={cn(
                          "absolute bottom-0 left-0 h-0.5 transition-all duration-1000",
                          stat.isCritical ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" : stat.isStale ? "bg-amber-500" : "bg-green-500"
                        )}
                        style={{ width: `${stat.remainingPercent}%` }}
                      />
                    )}

                    <div className="flex items-center justify-between mb-2">
                       <span className="text-[8px] font-display font-bold uppercase tracking-widest opacity-40">{stat.label}</span>
                       {stat.latestDate ? (
                         stat.isCritical ? (
                           <AlertTriangle className="w-2.5 h-2.5 text-red-500 animate-pulse" />
                         ) : stat.isStale ? (
                           <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                         ) : (
                           <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
                         )
                       ) : (
                         <div className="w-2.5 h-2.5 rounded-full border border-current opacity-20" />
                       )}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn(
                          "text-[10px] font-mono font-bold tracking-tight shrink-0",
                          stat.latestDate ? "text-white/80" : "text-white/20"
                        )}>
                          {stat.latestDate ? stat.latestDate : "NO DATA"}
                        </span>
                        {stat.latestDate && (
                          <span className={cn(
                            "text-[8px] font-mono font-bold",
                            stat.isCritical ? "text-red-400" : stat.isStale ? "text-amber-400" : "text-green-400"
                          )}>
                            {stat.remainingPercent}%
                          </span>
                        )}
                      </div>
                      {stat.latestDate && (
                        <div className="flex items-center justify-between mt-0.5">
                          <span className={cn(
                            "text-[8px] font-mono uppercase",
                            stat.isCritical ? "text-red-500/60" : stat.isStale ? "text-amber-500/60" : "text-green-500/60"
                          )}>
                            {stat.timeAgo}
                          </span>
                          <span className="text-[7px] font-mono opacity-0 group-hover/stat:opacity-40 transition-opacity uppercase tracking-tighter">Remaining</span>
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
      <div className="p-8 text-center bg-white/[0.02] border border-white/5 border-dashed rounded-[2rem]">
        <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full border border-white/10 mb-4">
          <ClipboardCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[9px] font-display font-bold text-white/40 uppercase tracking-[0.2em]">Audit Logic Powered by DT.Base Engine</span>
        </div>
        <p className="text-[10px] text-white/20 leading-relaxed uppercase tracking-widest max-w-sm mx-auto">
          Status colors: Green (Recent), Yellow (Due Soon), Red (Critical/Overdue). 
          Timelines vary by component (5–12 months). Red line is reached at 13 months for all categories.
        </p>
      </div>
    </div>
  );
};
