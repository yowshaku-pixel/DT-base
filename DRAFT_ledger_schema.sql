-- SQL to create the financial_ledger table in Supabase
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.financial_ledger (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plate TEXT NOT NULL,
    service_date DATE NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'KSH',
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster searching
CREATE INDEX IF NOT EXISTS idx_ledger_plate ON public.financial_ledger(plate);
CREATE INDEX IF NOT EXISTS idx_ledger_description ON public.financial_ledger(description);

-- RLS Policies (Row Level Security)
ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY;

-- Allow users to see all records (read-only for fleet intelligence)
CREATE POLICY "Allow public read access" ON public.financial_ledger
    FOR SELECT USING (true);

-- Allow authenticated users to insert records
CREATE POLICY "Allow authenticated inserts" ON public.financial_ledger
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
