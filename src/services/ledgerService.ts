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

    // Date Pattern: Date: DD/MM/YYYY
    const dateMatch = line.match(/Date:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dateMatch) {
      const [d, m, y] = dateMatch[1].split('/');
      currentDate = `${y}-${m}-${d}`; // ISO format
      continue;
    }

    // Plate Pattern: ★PLATE or ◇PLATE at start of line
    const plateMatch = line.match(/^[★◇]\s*([a-zA-Z0-9]+)/i);
    if (plateMatch) {
      currentPlate = plateMatch[1].toUpperCase();
      continue;
    }

    // Item Pattern: *Description : currency Amount
    // Matches: *parking fee : ksh 3000
    // Matches: *mechanic for equalizer : ksh1000
    // Matches: * 13m.m , 4p bolt : ksh 160
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
      const plate = inlineMatch[1].toUpperCase();
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
