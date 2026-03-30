export interface MaintenanceRecord {
  id: string;
  plateNumber: string;
  date: string;
  service: string;
  confidence: number;
  originalImage?: string;
  fileName?: string;
}

export interface ExtractionResult {
  records: Omit<MaintenanceRecord, 'id'>[];
}
