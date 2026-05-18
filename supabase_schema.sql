-- Supabase SQL Schema for Stage 1

-- 1. Create the HOD Profiles table
-- This table stores metadata about HODs. The 'id' will match the Supabase Auth UID.
CREATE TABLE IF NOT EXISTS hod_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    department_name TEXT NOT NULL,
    email_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE hod_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create Policies

-- Allow the Controller (Super Admin) to do everything
-- Note: In a real app, you'd check for a 'controller' role in auth.users metadata.
-- For Stage 1, we assume the service role key handles admin operations from the server.
-- However, we can add a policy for authenticated HODs to read their own profile.

CREATE POLICY "HODs can view their own profile"
ON hod_profiles
FOR SELECT
USING (auth.uid() = id);

-- 4. Secure Password Handling Note:
-- We do NOT store passwords in this table. 
-- Passwords are managed strictly via Supabase Auth (auth.users).
-- The Controller uses the Supabase Admin API (createUser) to provision accounts.
-- This ensures passwords are encrypted and managed by Supabase's secure infrastructure.
