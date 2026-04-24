import React, { useMemo } from 'react';
import { MaintenanceRecord } from '../types';
import { 
  Zap, 
  Battery, 
  BatteryMedium, 
  BatteryLow, 
  BatteryFull, 
  AlertTriangle, 
  ShieldCheck, 
  Clock,
  TrendingDown,
  Activity,
  Truck
} from 'lucide-react';
import { 
  normalizePlate, 
  normalizeDate,
  cn 
} from '../lib/utils';
import { AUDIT_CATEGORIES } from '../services/auditService';

interface BatteryIntelligenceProps {
  records: MaintenanceRecord[];
  fleetRegistry: string[];
}

export const BatteryIntelligence: React.FC<BatteryIntelligenceProps> = ({ records, fleetRegistry }) => {
  const batteryStats = useMemo(() => {
    const batteryRE = AUDIT_CATEGORIES.find(c => c.id === 'battery')?.match || (() => false);
    const repairRE = AUDIT_CATEGORIES.find(c => c.id === 'battery_repair')?.match || (() => false);

    const truckMap: Record<string, { 
      lastNew: string | null, 
      lastRepair: string | null, 
      repairCount: number,
      history: MaintenanceRecord[]
    }> = {};

    // Filter and group battery records
    records.forEach(r => {
      const desc = r.service_description.toLowerCase();
      const isNew = batteryRE(desc);
      const isRepair = repairRE(desc);

      if (isNew || isRepair) {
        const plate = normalizePlate(r.plate_number || 'UNKNOWN');
        if (!truckMap[plate]) {
          truckMap[plate] = { lastNew: null, lastRepair: null, repairCount: 0, history: [] };
        }
        
        const rDate = normalizeDate(r.service_date);
        if (isNew) {
          if (!truckMap[plate].lastNew || rDate > truckMap[plate].lastNew!) {
            truckMap[plate].lastNew = rDate;
          }
        }
        
        // Add to history with metadata
        (truckMap[plate].history as any).push({ ...r, _isNew: isNew, _isRepair: isRepair, _rDate: rDate });
      }
    });

    // Second pass to filter repairs based on the latest new battery
    Object.entries(truckMap).forEach(([plate, data]) => {
      const lastNewTime = data.lastNew ? new Date(data.lastNew).getTime() : 0;
      
      const validRepairs = (data.history as any[]).filter(r => 
        r._isRepair && new Date(r._rDate).getTime() > lastNewTime
      );
      
      data.repairCount = validRepairs.length;
      data.lastRepair = validRepairs.length > 0 
        ? validRepairs.sort((a, b) => new Date(b._rDate).getTime() - new Date(a._rDate).getTime())[0]._rDate
        : null;
    });

    const analysis = Object.entries(truckMap).map(([plate, data]) => {
      const now = new Date();
      const lastAction = data.lastNew && data.lastRepair 
        ? (data.lastNew > data.lastRepair ? data.lastNew : data.lastRepair)
        : (data.lastNew || data.lastRepair);
      
      const lastActionDate = lastAction ? new Date(lastAction) : null;
      const monthsSince = lastActionDate ? Math.floor((now.getTime() - lastActionDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)) : 999;

      let status: 'optimum' | 'warning' | 'critical' = 'optimum';
      let health = 100;
      let recommendation = 'No action needed';

      // Advanced logic
      if (data.repairCount >= 3 && (!data.lastNew || data.lastRepair! > data.lastNew!)) {
        status = 'critical';
        health = 30;
        recommendation = 'Multiple repairs detected. Replace battery immediately.';
      } else if (monthsSince > 12 && data.lastNew) {
        status = 'warning';
        health = 60;
        recommendation = 'Battery exceeding 1 year. Monitor capacity.';
      } else if (data.lastRepair && (!data.lastNew || data.lastRepair! > data.lastNew!)) {
        status = 'warning';
        health = 75;
        recommendation = 'Running on repaired battery. Consider new unit for stability.';
      }

      if (monthsSince > 18) {
        status = 'critical';
        health = Math.min(health, 20);
        recommendation = 'End of life reached. Critical failure risk.';
      }

      return {
        plate,
        ...data,
        monthsSince,
        status,
        health,
        recommendation
      };
    }).sort((a, b) => a.health - b.health);

    const fleetHealth = analysis.length > 0 
      ? Math.round(analysis.reduce((acc, curr) => acc + curr.health, 0) / analysis.length)
      : 100;

    return {
      analysis,
      fleetHealth,
      criticalCount: analysis.filter(a => a.status === 'critical').length,
      warningCount: analysis.filter(a => a.status === 'warning').length
    };
  }, [records]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Dashboard Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-[2rem] p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 blur-3xl -mr-8 -mt-8" />
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Activity className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Fleet Readiness</p>
              <h3 className="text-2xl font-display font-bold text-text">{batteryStats.fleetHealth}%</h3>
            </div>
          </div>
          <div className="w-full bg-bg h-1.5 rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full transition-all duration-1000",
                batteryStats.fleetHealth > 80 ? "bg-green-500" : batteryStats.fleetHealth > 50 ? "bg-amber-500" : "bg-red-500"
              )}
              style={{ width: `${batteryStats.fleetHealth}%` }}
            />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-[2rem] p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 blur-3xl -mr-8 -mt-8" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400 animate-pulse" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Critical Risks</p>
              <h3 className="text-2xl font-display font-bold text-text">{batteryStats.criticalCount} Trucks</h3>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-[2rem] p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-3xl -mr-8 -mt-8" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Awaiting Monitor</p>
              <h3 className="text-2xl font-display font-bold text-text">{batteryStats.warningCount} Trucks</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Main Intelligence Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {batteryStats.analysis.map((truck) => (
          <div 
            key={truck.plate}
            className={cn(
              "p-6 rounded-[2rem] border transition-all duration-500 group",
              truck.status === 'critical' ? "bg-red-500/[0.03] border-red-500/20" : 
              truck.status === 'warning' ? "bg-amber-500/[0.03] border-amber-500/20" : 
              "bg-surface border-border"
            )}
          >
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-14 h-14 rounded-3xl flex items-center justify-center border transition-transform group-hover:scale-110",
                  truck.status === 'critical' ? "bg-red-500/10 border-red-500/20" : 
                  truck.status === 'warning' ? "bg-amber-500/10 border-amber-500/20" : 
                  "bg-bg border-border"
                )}>
                  {truck.health > 80 ? <BatteryFull className="w-7 h-7 text-green-500" /> : 
                   truck.health > 40 ? <BatteryMedium className="w-7 h-7 text-amber-500" /> : 
                   <BatteryLow className="w-7 h-7 text-red-500" />}
                </div>
                <div>
                  <h4 className="text-lg font-display font-bold text-text tracking-tight">{truck.plate}</h4>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-blue-400" />
                      <span className="text-[10px] font-mono text-muted uppercase">{truck.repairCount} Repairs</span>
                    </div>
                    {truck.lastNew && (
                      <div className="flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-green-400" />
                        <span className="text-[10px] font-mono text-muted uppercase">Last New: {truck.lastNew}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={cn(
                  "text-2xl font-display font-bold",
                  truck.status === 'critical' ? "text-red-500" : 
                  truck.status === 'warning' ? "text-amber-500" : 
                  "text-green-500"
                )}>
                  {truck.health}%
                </div>
                <p className="text-[9px] font-mono text-muted uppercase tracking-widest">Health Score</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-bg/50 rounded-2xl border border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className={cn(
                    "w-3.5 h-3.5",
                    truck.status === 'critical' ? "text-red-400" : "text-blue-400"
                  )} />
                  <span className="text-[10px] font-display font-bold uppercase tracking-widest opacity-40">Intelligence Insight</span>
                </div>
                <p className={cn(
                  "text-[11px] font-medium leading-relaxed italic",
                  truck.status === 'critical' ? "text-red-400" : "text-text"
                )}>
                  "{truck.recommendation}"
                </p>
              </div>

              <div className="flex items-center justify-between px-2">
                <div className="flex -space-x-2">
                  {[...Array(5)].map((_, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "w-2 h-6 rounded-full border border-bg",
                        i < (truck.health / 20) 
                          ? (truck.status === 'critical' ? "bg-red-500" : truck.status === 'warning' ? "bg-amber-500" : "bg-green-500")
                          : "bg-surface"
                      )} 
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-muted/30" />
                  <span className="text-[10px] font-mono text-muted/60 uppercase">Cycle: {truck.monthsSince} Months</span>
                </div>
              </div>
            </div>
          </div>
        ))}
        {batteryStats.analysis.length === 0 && (
          <div className="col-span-full p-20 text-center bg-surface border border-border border-dashed rounded-[3rem]">
            <Battery className="w-12 h-12 text-muted/20 mx-auto mb-4" />
            <p className="text-sm font-display font-bold text-muted uppercase tracking-widest">No Battery Intelligence Data Found</p>
            <p className="text-[10px] text-muted/40 uppercase mt-2">Upload or capture battery maintenance records to begin analysis.</p>
          </div>
        )}
      </div>

      {/* Logic Summary Footer */}
      <div className="p-8 text-center bg-surface border border-border border-dashed rounded-[2rem]">
        <div className="inline-flex items-center gap-3 px-4 py-2 bg-surface rounded-full border border-border mb-4">
          <Zap className="w-3.5 h-3.5 text-blue-400" strokeWidth={3} />
          <span className="text-[9px] font-display font-bold text-muted uppercase tracking-[0.2em]">Battery AI Intelligence v1.0</span>
        </div>
        <p className="text-[10px] text-muted/40 leading-relaxed uppercase tracking-widest max-w-lg mx-auto">
          Analysis accounts for total repair cycles, date of last replacement, and brand history. 
          Repairs are viewed as temporary stability (avg 3-6 months), while new units carry 18-month reliability forecasts.
        </p>
      </div>
    </div>
  );
};
