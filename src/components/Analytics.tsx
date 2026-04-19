import React, { useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
import { MaintenanceRecord } from '../types';
import { BarChart3, TrendingUp, PieChart as PieChartIcon, Truck, Wrench, Calendar } from 'lucide-react';

interface AnalyticsProps {
  records: MaintenanceRecord[];
}

const COLORS = ['#8b5cf6', '#06b6d4', '#ec4899', '#f59e0b', '#10b981', '#6366f1'];

export const Analytics: React.FC<AnalyticsProps> = ({ records }) => {
  // 1. Prepare Timeline Data (Last 6 months)
  const timelineData = useMemo(() => {
    const months: Record<string, number> = {};
    const now = new Date();
    
    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short' });
      months[key] = 0;
    }

    records.forEach(r => {
      const d = new Date(r.service_date);
      if (isNaN(d.getTime())) return;
      const key = d.toLocaleString('default', { month: 'short' });
      if (months[key] !== undefined) {
        months[key]++;
      }
    });

    return Object.entries(months).map(([name, count]) => ({ name, count }));
  }, [records]);

  // 2. Prepare Category Data
  const categoryData = useMemo(() => {
    const categories: Record<string, number> = {
      'Oil Change': 0,
      'Brakes': 0,
      'Tyres': 0,
      'Engine': 0,
      'Suspension': 0,
      'Other': 0
    };

    records.forEach(r => {
      const desc = r.service_description.toLowerCase();
      if (desc.includes('oil')) categories['Oil Change']++;
      else if (desc.includes('brake') || desc.includes('pad') || desc.includes('shoe')) categories['Brakes']++;
      else if (desc.includes('tyre') || desc.includes('tire') || desc.includes('align')) categories['Tyres']++;
      else if (desc.includes('engine') || desc.includes('piston') || desc.includes('head')) categories['Engine']++;
      else if (desc.includes('spring') || desc.includes('bush') || desc.includes('shock')) categories['Suspension']++;
      else categories['Other']++;
    });

    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [records]);

  // 3. Top Trucks (Plate Activity)
  const truckData = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach(r => {
      counts[r.plate_number] = (counts[r.plate_number] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([plate, count]) => ({ plate, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [records]);

  const totalServices = records.length;
  const uniqueTrucks = new Set(records.map(r => r.plate_number)).size;

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md">
        <BarChart3 className="w-12 h-12 text-white/20 mb-4" />
        <h3 className="text-white font-display font-bold uppercase tracking-widest">No Data to Visualise</h3>
        <p className="text-white/40 text-[10px] mt-2 uppercase tracking-[0.2em]">Upload records to see analytics</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-3 h-3 text-purple-400" />
            <span className="text-[9px] font-display font-bold text-white/40 uppercase tracking-widest">Total Services</span>
          </div>
          <p className="text-2xl font-display font-bold text-white">{totalServices}</p>
        </div>
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-3 h-3 text-cyan-400" />
            <span className="text-[9px] font-display font-bold text-white/40 uppercase tracking-widest">Fleet Size</span>
          </div>
          <p className="text-2xl font-display font-bold text-white">{uniqueTrucks}</p>
        </div>
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <Wrench className="w-3 h-3 text-pink-400" />
            <span className="text-[9px] font-display font-bold text-white/40 uppercase tracking-widest">Main Issue</span>
          </div>
          <p className="text-2xl font-display font-bold text-white truncate">{categoryData[0]?.name || 'N/A'}</p>
        </div>
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-3 h-3 text-amber-400" />
            <span className="text-[9px] font-display font-bold text-white/40 uppercase tracking-widest">Active Period</span>
          </div>
          <p className="text-2xl font-display font-bold text-white">6 Months</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Maintenance Volume Area Chart */}
        <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-display font-bold text-white uppercase tracking-[0.2em]">Maintenance Pulse</h3>
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#ffffff40', fontSize: 10, fontFamily: 'monospace' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#ffffff40', fontSize: 10, fontFamily: 'monospace' }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                  itemStyle={{ color: '#a855f7', fontSize: '10px', textTransform: 'uppercase' }}
                  labelStyle={{ color: '#ffffff', fontSize: '10px', marginBottom: '4px' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#a855f7" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorCount)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Service Distribution Pie Chart */}
        <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-display font-bold text-white uppercase tracking-[0.2em]">Service Breakdown</h3>
            <PieChartIcon className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0.1)" />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '10px' }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  align="center"
                  wrapperStyle={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', paddingTop: '20px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Assets Bar Chart */}
        <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-md lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-display font-bold text-white uppercase tracking-[0.2em]">High Maintenance Assets</h3>
            <BarChart3 className="w-4 h-4 text-pink-400" />
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={truckData} layout="vertical" margin={{ left: 40, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#ffffff05" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="plate" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#ffffff', fontSize: 12, fontWeight: 'bold' }}
                />
                <Tooltip 
                   cursor={{ fill: '#ffffff05' }}
                   contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                   itemStyle={{ color: '#ec4899', fontSize: '10px' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={30}>
                  {truckData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[1]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex justify-center">
            <p className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em]">Reflecting top 5 most frequent registrations</p>
          </div>
        </div>
      </div>
    </div>
  );
};
