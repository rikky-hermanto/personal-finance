-- Create the bank-statements storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('bank-statements', 'bank-statements', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow users to insert their own files
CREATE POLICY "Users can upload their own bank statements" ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'bank-statements' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view their own files
CREATE POLICY "Users can view their own bank statements" ON storage.objects
FOR SELECT
USING (
    bucket_id = 'bank-statements' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own files
CREATE POLICY "Users can update their own bank statements" ON storage.objects
FOR UPDATE
USING (
    bucket_id = 'bank-statements' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own files
CREATE POLICY "Users can delete their own bank statements" ON storage.objects
FOR DELETE
USING (
    bucket_id = 'bank-statements' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
);
