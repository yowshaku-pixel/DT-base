export interface MaintenanceRecord {
  id: string;
  plate_number: string;
  service_date: string;
  service_description: string;
  confidence: number;
  originalImage?: string;
  file_name?: string;
  user_id: string;
  created_at: string;
  verified?: boolean;
  amount?: number;
  currency?: string;
}

export interface ExtractionResult {
  records: (Omit<MaintenanceRecord, 'id'> & { amount?: number; currency?: string })[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface PaymentRecord {
  id: string;
  plate: string;
  date: string;
  items: { description: string, amount: number, currency: string }[];
  total: number;
  currency: string;
  category?: 'maintenance' | 'parking' | 'labour' | 'parts' | 'other';
}

export interface ChatResponse {
  answer: string;
  suggestedActions?: string[];
}

export interface MarketPrice {
  id: string;
  item_name: string;
  price: number;
  currency: string;
  confirmed_by: string;
  last_updated: string;
  user_id: string;
}
