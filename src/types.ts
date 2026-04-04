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
