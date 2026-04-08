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
}

export interface ExtractionResult {
  records: Omit<MaintenanceRecord, 'id'>[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
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
