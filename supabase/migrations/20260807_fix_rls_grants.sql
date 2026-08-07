-- Fix: supplier_applications public insert failing with 42501
-- RLS policy exists but anon role needs explicit table grants too.
-- Run this in Supabase SQL Editor.

-- 1. Ensure RLS is enabled
ALTER TABLE public.supplier_applications ENABLE ROW LEVEL SECURITY;

-- 2. Drop any duplicate policy and recreate cleanly
DROP POLICY IF EXISTS "Enable public insert for supplier_applications" ON public.supplier_applications;

CREATE POLICY "Enable public insert for supplier_applications"
ON public.supplier_applications
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 3. Grant schema usage (required for PostgREST / anon access)
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 4. Grant table-level privileges (THIS was missing - causes 42501)
GRANT INSERT ON TABLE public.supplier_applications TO anon, authenticated;
GRANT SELECT ON TABLE public.supplier_applications TO anon, authenticated;

-- 5. Storage bucket and policy
INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-documents', 'supplier-documents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow public file uploads" ON storage.objects;

CREATE POLICY "Allow public file uploads"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'supplier-documents');
