import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Download, X, FileText, Calculator, User, Truck, Calendar, Hash } from 'lucide-react';
import { cn } from '../lib/utils';

interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  type: 'part' | 'labor';
}

interface QuotationGeneratorProps {
  onClose: () => void;
  initialPlate?: string;
}

export default function QuotationGenerator({ onClose, initialPlate = '' }: QuotationGeneratorProps) {
  const [plateNumber, setPlateNumber] = useState(initialPlate);
  const [clientName, setClientName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [quoteNumber, setQuoteNumber] = useState(`QT-${Math.floor(1000 + Math.random() * 9000)}`);
  
  const [items, setItems] = useState<QuoteItem[]>([
    { id: '1', description: '', quantity: 1, unitPrice: 0, type: 'part' }
  ]);

  const addItem = (type: 'part' | 'labor') => {
    setItems(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      description: '',
      quantity: 1,
      unitPrice: 0,
      type
    }]);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const updateItem = (id: string, updates: Partial<QuoteItem>) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const totals = useMemo(() => {
    const partsSubtotal = items
      .filter(i => i.type === 'part')
      .reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
    
    const laborSubtotal = items
      .filter(i => i.type === 'labor')
      .reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
    
    return {
      parts: partsSubtotal,
      labor: laborSubtotal,
      total: partsSubtotal + laborSubtotal
    };
  }, [items]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 md:p-8 overflow-y-auto">
      <div className="w-full max-w-5xl bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden min-h-[80vh]">
        
        {/* Left Side: Editor */}
        <div className="flex-1 p-6 md:p-8 border-b md:border-b-0 md:border-r border-white/10 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/20">
                <Calculator className="w-6 h-6 text-white" />
              </div>
              <h2 className="font-display font-bold text-xl text-white uppercase tracking-wider">Quotation Builder</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="space-y-2">
              <label className="text-[10px] font-display font-bold uppercase tracking-widest text-white/40 ml-2">Truck Plate</label>
              <div className="relative">
                <Truck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input 
                  type="text" 
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value)}
                  placeholder="E.G. KCN 851 S"
                  className="w-full bg-white/5 border border-white/10 p-3 pl-12 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-display font-bold uppercase tracking-widest text-white/40 ml-2">Client Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input 
                  type="text" 
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Customer name..."
                  className="w-full bg-white/5 border border-white/10 p-3 pl-12 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-display font-bold uppercase tracking-widest text-white/40 ml-2">Date</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 p-3 pl-12 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-display font-bold uppercase tracking-widest text-white/40 ml-2">Quote #</label>
              <div className="relative">
                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input 
                  type="text" 
                  value={quoteNumber}
                  onChange={(e) => setQuoteNumber(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 p-3 pl-12 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-display font-bold text-white uppercase tracking-[0.2em]">Line Items</h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => addItem('part')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 text-[10px] font-display font-bold uppercase tracking-widest rounded-lg transition-all"
                >
                  <Plus className="w-3 h-3" /> Add Part
                </button>
                <button 
                  onClick={() => addItem('labor')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-[10px] font-display font-bold uppercase tracking-widest rounded-lg transition-all"
                >
                  <Plus className="w-3 h-3" /> Add Labor
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col md:flex-row gap-3 p-4 bg-white/5 border border-white/5 rounded-2xl group transition-all hover:border-white/10">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-[9px] font-display font-bold uppercase tracking-widest px-2 py-0.5 rounded",
                        item.type === 'part' ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"
                      )}>
                        {item.type}
                      </span>
                      <button 
                        onClick={() => removeItem(item.id)}
                        className="p-1 text-white/20 hover:text-red-400 transition-colors md:opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <input 
                      type="text"
                      placeholder={item.type === 'part' ? "Spare part name..." : "Service description..."}
                      value={item.description}
                      onChange={(e) => updateItem(item.id, { description: e.target.value })}
                      className="w-full bg-transparent border-none p-0 text-sm text-white placeholder:text-white/10 focus:ring-0"
                    />
                  </div>
                  <div className="flex gap-3 items-end">
                    <div className="w-20 space-y-1">
                      <label className="text-[8px] font-display font-bold uppercase tracking-widest text-white/20">Qty</label>
                      <input 
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white/5 border border-white/10 p-2 rounded-lg text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                      />
                    </div>
                    <div className="w-32 space-y-1">
                      <label className="text-[8px] font-display font-bold uppercase tracking-widest text-white/20">Unit Price</label>
                      <input 
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white/5 border border-white/10 p-2 rounded-lg text-xs text-white text-right focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Preview */}
        <div className="w-full md:w-[400px] bg-zinc-950 p-6 md:p-8 flex flex-col print:hidden">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-8">
              <FileText className="w-4 h-4 text-purple-500" />
              <h3 className="text-xs font-display font-bold text-white uppercase tracking-[0.3em]">Live Preview</h3>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-2xl text-zinc-900 aspect-[1/1.414] flex flex-col">
              <div className="flex justify-between items-start mb-6 border-b-2 border-zinc-900 pb-4">
                <div>
                  <h1 className="text-2xl font-display font-black tracking-tighter uppercase italic">DT.Base</h1>
                  <p className="text-[8px] font-mono uppercase tracking-widest opacity-60">Fleet Maintenance & Logistics</p>
                </div>
                <div className="text-right">
                  <h2 className="text-lg font-display font-bold uppercase tracking-widest">Quotation</h2>
                  <p className="text-[10px] font-mono">{quoteNumber}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6 text-[10px]">
                <div>
                  <p className="font-bold uppercase tracking-widest opacity-40 mb-1">To:</p>
                  <p className="font-bold">{clientName || 'Valued Customer'}</p>
                  <p className="opacity-60">Truck: {plateNumber || '---'}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold uppercase tracking-widest opacity-40 mb-1">Date:</p>
                  <p>{date}</p>
                </div>
              </div>

              <div className="flex-1">
                <table className="w-full text-[9px]">
                  <thead>
                    <tr className="border-b border-zinc-200">
                      <th className="text-left py-2 uppercase tracking-widest opacity-40">Description</th>
                      <th className="text-center py-2 uppercase tracking-widest opacity-40">Qty</th>
                      <th className="text-right py-2 uppercase tracking-widest opacity-40">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2">
                          <p className="font-bold">{item.description || 'Untitled Item'}</p>
                          <p className="text-[7px] opacity-40 uppercase">{item.type}</p>
                        </td>
                        <td className="py-2 text-center">{item.quantity}</td>
                        <td className="py-2 text-right font-bold">{(item.quantity * item.unitPrice).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 pt-4 border-t-2 border-zinc-900 space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="opacity-40 uppercase tracking-widest">Parts Subtotal</span>
                  <span>{totals.parts.toLocaleString()} KES</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="opacity-40 uppercase tracking-widest">Labor Subtotal</span>
                  <span>{totals.labor.toLocaleString()} KES</span>
                </div>
                <div className="flex justify-between text-lg font-display font-black uppercase italic pt-2">
                  <span>Total</span>
                  <span className="text-purple-600">{totals.total.toLocaleString()} KES</span>
                </div>
              </div>

              <div className="mt-8 text-[7px] text-center opacity-40 uppercase tracking-[0.2em] font-mono">
                Thank you for your business. Valid for 7 days.
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <button 
              onClick={handlePrint}
              className="w-full py-4 bg-white text-zinc-900 font-display font-bold uppercase tracking-[0.2em] text-xs rounded-xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 shadow-xl"
            >
              <Download className="w-4 h-4" />
              Download / Print
            </button>
            <p className="text-[9px] text-center text-white/20 font-display font-medium uppercase tracking-widest">
              * This will open the print dialog. Save as PDF for digital sharing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
