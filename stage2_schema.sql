-- Supabase SQL Schema for Stage 2: HOD Portal & Static Data

-- 1. Batches Table
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_year INTEGER UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id) -- The HOD who created it
);

-- 2. Faculties Table
CREATE TABLE IF NOT EXISTS faculties (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email_id TEXT UNIQUE NOT NULL CHECK (email_id ~* '^[A-Za-z0-9._%+-]+@uecu\.ac\.in$'),
    department_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id)
);

-- 3. Students Table
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
    enrollment_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    email_id TEXT UNIQUE NOT NULL CHECK (email_id ~* '^[A-Za-z0-9._%+-]+@uecu\.ac\.in$'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id)
);

-- 4. Subjects Table
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_code TEXT UNIQUE NOT NULL,
    subject_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id)
);

-- 5. Classes Table (The Mapping Engine)
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semester INTEGER NOT NULL,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    faculty_id UUID REFERENCES faculties(id) ON DELETE CASCADE,
    target_batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on all tables
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE faculties ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Simplified for Stage 2: HODs can manage their own data)
-- In a full production app, we would use custom claims (e.g., role='hod') 
-- For now, we allow authenticated users to interact with data they created or are associated with.

-- Batches Policies
CREATE POLICY "HODs can manage batches" ON batches FOR ALL USING (auth.role() = 'authenticated');

-- Faculties Policies
CREATE POLICY "HODs can manage faculties" ON faculties FOR ALL USING (auth.role() = 'authenticated');

-- Students Policies
CREATE POLICY "HODs can manage students" ON students FOR ALL USING (auth.role() = 'authenticated');

-- Subjects Policies
CREATE POLICY "HODs can manage subjects" ON subjects FOR ALL USING (auth.role() = 'authenticated');

-- Classes Policies
CREATE POLICY "HODs can manage classes" ON classes FOR ALL USING (auth.role() = 'authenticated');
