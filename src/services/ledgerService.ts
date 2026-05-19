import { supabase } from '../supabase';
import { PaymentRecord } from '../types';

export interface LedgerItem {
  id?: string;
  plate: string;
  service_date: string;
  description: string;
  amount: number;
  currency: string;
  user_id?: string;
  created_at?: string;
  verified?: boolean;
}

export async function fetchLedgerItems(plate?: string, query?: string): Promise<LedgerItem[]> {
  if (!supabase) return [];

  let request = supabase
    .from('financial_ledger')
    .select('*')
    .order('service_date', { ascending: false });

  if (plate) {
    request = request.ilike('plate', `%${plate}%`);
  }

  if (query) {
    request = request.or(`description.ilike.%${query}%,plate.ilike.%${query}%`);
  }

  const { data, error } = await request;

  if (error) {
    console.error('Error fetching ledger items:', error);
    throw error;
  }

  return data || [];
}

export async function saveLedgerItem(item: LedgerItem) {
  if (!supabase) return;

  const { data, error } = await supabase
    .from('financial_ledger')
    .insert([item]);

  if (error) {
    throw error;
  }

  return data;
}

export async function bulkSaveLedgerItems(items: LedgerItem[]) {
  if (!supabase) return;

  const { data, error } = await supabase
    .from('financial_ledger')
    .insert(items);

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Parses the raw text intelligence data into structured LedgerItems.
 */
export function parseRawLedgerData(text: string): LedgerItem[] {
  const items: LedgerItem[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  let currentDate = '';
  let currentPlate = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Date Pattern: Date: DD/MM/YYYY or just DD/MM/YYYY or DD.MM.YYYY
    const dateMatch = line.match(/(?:Date:\s*)?(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/i);
    if (dateMatch) {
      let d = dateMatch[1].padStart(2, '0');
      let m = dateMatch[2].padStart(2, '0');
      let y = dateMatch[3];
      if (y.length === 2) y = `20${y}`;
      
      // Basic validation - check if it's likely a date
      if (parseInt(d) <= 31 && parseInt(m) <= 12) {
        currentDate = `${y}-${m}-${d}`; // ISO format
        // Don't continue if it might also be a plate on the same line, but usually dates are standalone headers
        if (line.length < 15) continue; 
      }
    }

    // Plate Pattern: ★PLATE or ◇PLATE at start of line, or just ★PLATE
    const plateMatch = line.match(/^[★◇]\s*([a-zA-Z0-9]+)/i) || line.match(/^[★\*]\s*([A-Z]{3}\s*\d{3}[A-Z]?)/i);
    if (plateMatch) {
      currentPlate = plateMatch[1].replace(/\s+/g, '').toUpperCase();
      continue;
    }

    // Item Pattern: *Description : currency Amount
    const itemMatch = line.match(/^\*\s*(.+?)\s*:\s*([a-zA-Z]+)?\s*(\d+(?:\.\d+)?(?:,\d+)*)/i);
    if (itemMatch && currentPlate && currentDate) {
      const description = itemMatch[1].trim();
      const currency = (itemMatch[2] || 'KSH').toUpperCase();
      const amount = parseFloat(itemMatch[3].replace(/,/g, ''));

      items.push({
        plate: currentPlate,
        service_date: currentDate,
        description,
        amount,
        currency
      });
      continue;
    }

    // Inline Plate Pattern: ◇UBD577z : parking fee : ksh 1000
    const inlineMatch = line.match(/[★◇]\s*([a-zA-Z0-9]+)\s*:\s*(.+?)\s*:\s*([a-zA-Z]+)?\s*(\d+(?:\.\d+)?(?:,\d+)*)/i);
    if (inlineMatch && currentDate) {
      const plate = inlineMatch[1].replace(/\s+/g, '').toUpperCase();
      const description = inlineMatch[2].trim();
      const currency = (inlineMatch[3] || 'KSH').toUpperCase();
      const amount = parseFloat(inlineMatch[4].replace(/,/g, ''));

      items.push({
        plate,
        service_date: currentDate,
        description,
        amount,
        currency
      });
    }
  }

  return items;
}

/**
 * Harvests potential market prices from ledger items using "Smart" logic.
 */
export function harvestMarketPrices(items: LedgerItem[]): { item_name: string, price: number, currency: string }[] {
  const harvested: Map<string, { item_name: string, price: number, currency: string, date: string }> = new Map();

  items.forEach(item => {
    const desc = item.description.trim();
    const normalized = desc.toLowerCase();

    // "Smart" filter: Ignore complicated or unclear items
    if (desc.length < 4 || desc.length > 55) return;
    if (!/[a-zA-Z]/.test(desc)) return;
    if ((desc.match(/[^a-zA-Z0-9\s]/g) || []).length > 5) return;

    // Check if we already have this item
    const existing = harvested.get(normalized);
    
    // Rule: Take the latest one, or if same date, maybe the one with a more plausible price?
    // Let's keep it simple: Latest one wins.
    if (!existing || new Date(item.service_date) > new Date(existing.date)) {
      harvested.set(normalized, {
        item_name: desc.toUpperCase(),
        price: item.amount,
        currency: item.currency,
        date: item.service_date
      });
    }
  });

  return Array.from(harvested.values()).map(({ item_name, price, currency }) => ({
    item_name,
    price,
    currency
  }));
}
