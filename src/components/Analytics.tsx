import React, { useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, Legend, RadialBarChart, RadialBar
} from 'recharts';
import { MaintenanceRecord } from '../types';
import { calculateAuditStats, AUDIT_CATEGORIES, RED_MONTHS } from '../services/auditService';
import { normalizePlate, arePlatesSimilar, normalizeDate, cn } from '../lib/utils';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Flame, 
  TrendingUp, 
  PieChart as PieChartIcon, 
  Truck, 
  Wrench, 
  Activity,
  RefreshCw
} from 'lucide-react';

interface AnalyticsProps {
  records: MaintenanceRecord[];
  fleetRegistry: string[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444']; // Green, Yellow, Red

export const Analytics: React.FC<AnalyticsProps> = ({ records, fleetRegistry, onRefresh, isRefreshing }) => {
  // 1. Audit Data Synthesis
  const auditSynthesis = useMemo(() => {
    const groups: Record<string, MaintenanceRecord[]> = {};
    const cleanRegistry = fleetRegistry.map(p => p.trim()).filter(p => p.length > 0);

    // Filter for relevant years as in Audit Report
    const relevantRecords = records.filter(r => {
      const normalizedDate = normalizeDate(r.service_date);
      if (!normalizedDate) return false;
      const year = parseInt(normalizedDate.split('-')[0]);
      return year === 2025 || year === 2026;
    });

    relevantRecords.forEach(record => {
      const plate = record.plate_number ? record.plate_number.toUpperCase().trim() : 'UNKNOWN';
      const normalizedRecordPlate = normalizePlate(plate);
      const registryMatch = cleanRegistry.find(p => normalizePlate(p) === normalizedRecordPlate) || 
                          cleanRegistry.find(p => arePlatesSimilar(p, plate));

      // Group by normalized plate even if not in registry to avoid "KCH 054 T" vs "KCH 054T"
      const existingKey = Object.keys(groups).find(k => normalizePlate(k) === normalizedRecordPlate);
      const groupKey = registryMatch || existingKey || plate;
      
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(record);
    });

    const fleetStatus = Object.entries(groups).map(([plate, truckRecords]) => ({
      plate,
      stats: calculateAuditStats(truckRecords)
    }));

    // Aggregate health stats
    const totalChecks = fleetStatus.length * AUDIT_CATEGORIES.length;
    let greenCount = 0;
    let yellowCount = 0;
    let redCount = 0;

    const categoryReadiness = AUDIT_CATEGORIES.map(cat => {
      const catResults = fleetStatus.map(f => f.stats.find(s => s.catId === cat.id));
      const healthy = catResults.filter(r => !r?.isStale && !r?.isCritical && r?.latestDate).length;
      const warning = catResults.filter(r => r?.isStale && !r?.isCritical).length;
      const critical = catResults.filter(r => r?.isCritical || !r?.latestDate).length;

      greenCount += healthy;
      yellowCount += warning;
      redCount += critical;

      return {
        name: cat.label,
        healthy,
        warning,
        critical,
        readiness: Math.round((healthy / fleetStatus.length) * 100)
      };
    });

    const fleetHealthScore = totalChecks > 0 ? Math.round(((greenCount + (yellowCount * 0.5)) / totalChecks) * 100) : 0;

    return {
      fleetStatus,
      fleetHealthScore,
      categoryReadiness,
      totals: { green: greenCount, yellow: yellowCount, red: redCount }
    };
  }, [records, fleetRegistry]);

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-surface border border-border rounded-2xl backdrop-blur-md">
        <Activity className="w-12 h-12 text-muted/20 mb-4" />
        <h3 className="text-text font-display font-bold uppercase tracking-widest">Awaiting Audit Data</h3>
        <p className="text-muted text-[10px] mt-2 uppercase tracking-[0.2em]">Upload log images to generate fleet insights</p>
      </div>
    );
  }

  const overallPieData = [
    { name: 'Recent', value: auditSynthesis.totals.green, fill: '#10b981' },
    { name: 'Due Soon', value: auditSynthesis.totals.yellow, fill: '#f59e0b' },
    { name: 'Critical/Overdue', value: auditSynthesis.totals.red, fill: '#ef4444' }
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-xl font-display font-black text-text italic tracking-tight uppercase">Fleet Synthesis</h2>
          <p className="text-[9px] font-mono text-muted uppercase tracking-[0.3em]">Real-time audit intelligence</p>
        </div>
        {onRefresh && (
          <button 
            onClick={onRefresh}
            disabled={isRefreshing}
            className={cn(
              "flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-xl text-[10px] font-display font-bold text-text uppercase tracking-widest hover:bg-bg transition-all",
              isRefreshing && "opacity-50 cursor-not-allowed"
            )}
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-cyan-400", isRefreshing && "animate-spin")} />
            {isRefreshing ? 'Syncing...' : 'Sync Data'}
          </button>
        )}
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Readiness Score */}
        <div className="bg-surface border border-border p-8 rounded-[2.5rem] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[50px] -mr-16 -mt-16 group-hover:bg-purple-500/20 transition-all" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <span className="text-[10px] font-display font-bold text-muted uppercase tracking-[0.3em] mb-6">Fleet Health Index</span>
            <div className="relative w-40 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart 
                  innerRadius="80%" 
                  outerRadius="100%" 
                  barSize={12} 
                  data={[{ value: auditSynthesis.fleetHealthScore }]} 
                  startAngle={180} 
                  endAngle={-180}
                >
                  <RadialBar
                    background={{ fill: 'var(--color-bg-val)', opacity: 0.2 }}
                    dataKey="value"
                    cornerRadius={30}
                    fill={auditSynthesis.fleetHealthScore > 80 ? "#10b981" : auditSynthesis.fleetHealthScore > 50 ? "#f59e0b" : "#ef4444"}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-display font-black text-text italic">{auditSynthesis.fleetHealthScore}%</span>
                <span className="text-[9px] font-mono text-muted uppercase mt-1">Readiness</span>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2">
              <ShieldCheck className={cn("w-4 h-4", auditSynthesis.fleetHealthScore > 80 ? "text-green-500" : "text-muted")} />
              <span className="text-[9px] font-display font-bold text-muted uppercase tracking-widest leading-none">
                {auditSynthesis.fleetHealthScore > 80 ? "Operational Excellence" : "Preventive Attention Required"}
              </span>
            </div>
          </div>
        </div>

        {/* Audit Pillars Bar Chart */}
        <div className="md:col-span-2 bg-surface border border-border p-8 rounded-[2.5rem] flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-1 h-4 bg-cyan-500 rounded-full" />
              <h3 className="text-xs font-display font-bold text-text uppercase tracking-[0.2em]">Maintenance Categories Score</h3>
            </div>
            <Activity className="w-4 h-4 text-cyan-400 opacity-40" />
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={auditSynthesis.categoryReadiness} margin={{ bottom: 20 }}>
                <defs>
                  <linearGradient id="readyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.2}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-val)" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'var(--color-muted-val)', fontSize: 8, fontFamily: 'monospace' }}
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis hide domain={[0, 100]} />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ backgroundColor: 'var(--color-bg-val)', border: '1px solid var(--color-border-val)', borderRadius: '16px' }}
                  itemStyle={{ fontSize: '10px', textTransform: 'uppercase' }}
                  labelStyle={{ color: 'var(--color-text-val)', fontSize: '10px', marginBottom: '8px', fontWeight: 'bold' }}
                />
                <Bar dataKey="readiness" radius={[8, 8, 0, 0]} barSize={25}>
                  {auditSynthesis.categoryReadiness.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.readiness > 80 ? "#10b981" : entry.readiness > 50 ? "#f59e0b" : "#ef4444"} 
                      fillOpacity={0.6}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Risk Distribution */}
        <div className="bg-surface border border-border p-8 rounded-[2.5rem] backdrop-blur-xl">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-1 h-4 bg-amber-500 rounded-full" />
              <h3 className="text-xs font-display font-bold text-text uppercase tracking-[0.2em]">Fleet Risk Factor</h3>
            </div>
            <AlertTriangle className="w-4 h-4 text-amber-400 opacity-40" />
          </div>
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="h-[240px] w-full md:w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={overallPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {overallPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={0.7} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--color-bg-val)', border: '1px solid var(--color-border-val)', borderRadius: '16px' }}
                    itemStyle={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-text-val)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full md:w-1/2 space-y-4">
              {overallPieData.map((item, i) => (
                <div key={i} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ color: item.fill }} />
                    <span className="text-[10px] font-display font-bold text-muted uppercase tracking-widest">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-1 bg-bg border border-border/20 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-current transition-all duration-1000" 
                        style={{ width: `${(item.value / (auditSynthesis.totals.green + auditSynthesis.totals.yellow + auditSynthesis.totals.red)) * 100}%`, color: item.fill }} 
                      />
                    </div>
                    <span className="text-xs font-mono font-bold text-text w-8 text-right">{item.value}</span>
                  </div>
                </div>
              ))}
              <p className="mt-8 pt-6 border-t border-border text-[9px] font-mono text-muted uppercase tracking-wider leading-relaxed italic">
                Risk is calculated across all 8 core maintenance categories per truck.
              </p>
            </div>
          </div>
        </div>

        {/* Critical Attention Assets */}
        <div className="bg-white/[0.03] border border-white/10 p-8 rounded-[2.5rem] backdrop-blur-xl">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-1 h-4 bg-red-500 rounded-full" />
              <h3 className="text-xs font-display font-bold text-white uppercase tracking-[0.2em]">Critical Attention Queue</h3>
            </div>
            <Flame className="w-4 h-4 text-red-400 animate-pulse" />
          </div>
          
          <div className="space-y-4">
            {auditSynthesis.fleetStatus
              .map(truck => ({
                plate: truck.plate,
                criticalCount: truck.stats.filter(s => s.isCritical).length,
                warningCount: truck.stats.filter(s => s.isStale && !s.isCritical).length
              }))
              .sort((a, b) => b.criticalCount - a.criticalCount || b.warningCount - a.warningCount)
              .slice(0, 5)
              .map((truck, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.05] transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center font-display font-black text-xs text-white italic tracking-tighter">
                      {i + 1}
                    </div>
                    <div>
                      <h4 className="text-sm font-display font-black text-white italic tracking-tight">{truck.plate}</h4>
                      <p className="text-[8px] font-mono text-white/20 uppercase tracking-widest mt-0.5">Focus Required Immediately</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {truck.criticalCount > 0 && (
                      <div className="px-2 py-1 bg-red-500/10 border border-red-500/30 rounded text-[9px] font-mono font-black text-red-400">
                        {truck.criticalCount} RED
                      </div>
                    )}
                    {truck.warningCount > 0 && (
                      <div className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-[9px] font-mono font-black text-amber-400">
                        {truck.warningCount} DUE
                      </div>
                    )}
                  </div>
                </div>
              ))}
            
            <div className="mt-6 p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
              <div className="flex items-start gap-3">
                <Truck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[9px] text-blue-200/50 leading-relaxed uppercase tracking-wider">
                  Data reflects latest 2025-2026 fleet audit records. Asset priority is ranked by the number of overdue critical service categories.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
