-- Drop existing tables if they exist
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS batches CASCADE;
DROP TABLE IF EXISTS faculties CASCADE;
DROP TABLE IF EXISTS department_admins CASCADE;
DROP TABLE IF EXISTS hod_profiles CASCADE;

-- 1. HOD Profiles (The root of department isolation)
CREATE TABLE hod_profiles (
    department_name TEXT PRIMARY KEY,
    email_id TEXT UNIQUE NOT NULL,
    id UUID UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Department Admins (Data Entry)
CREATE TABLE department_admins (
    id UUID PRIMARY KEY,
    email_id TEXT UNIQUE NOT NULL,
    department_name TEXT NOT NULL REFERENCES hod_profiles(department_name) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Faculties
CREATE TABLE faculties (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    email_id TEXT UNIQUE NOT NULL,
    department_name TEXT NOT NULL REFERENCES hod_profiles(department_name) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Batches
CREATE TABLE batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_year INTEGER NOT NULL,
    department_name TEXT NOT NULL REFERENCES hod_profiles(department_name) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(admission_year, department_name)
);

-- 5. Students
CREATE TABLE students (
    id UUID UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email_id TEXT UNIQUE NOT NULL,
    enrollment_number TEXT PRIMARY KEY CHECK (enrollment_number ~ '^\d{4}[A-Za-z]{2}\d{5,6}$'),
    phone_number TEXT,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    department_name TEXT NOT NULL REFERENCES hod_profiles(department_name) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Subjects
CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_code TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    department_name TEXT NOT NULL REFERENCES hod_profiles(department_name) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(subject_code, department_name)
);

-- 7. Classes (Mapping)
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semester INTEGER NOT NULL,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    faculty_id UUID REFERENCES faculties(id) ON DELETE CASCADE,
    target_batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
    faculty_status TEXT DEFAULT 'pending' CHECK (faculty_status IN ('pending', 'accepted', 'rejected')),
    total_classes INTEGER DEFAULT 0,
    total_labs INTEGER DEFAULT 0,
    total_theory_classes INTEGER DEFAULT 0,
    total_lab_sessions INTEGER DEFAULT 0,
    attendance_from DATE,
    attendance_to DATE,
    department_name TEXT NOT NULL REFERENCES hod_profiles(department_name) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Class Enrollments (Join Requests)
CREATE TABLE class_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  department_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. The Gradebook Table
CREATE TABLE grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  mst_1 NUMERIC DEFAULT 0,
  mst_2 NUMERIC DEFAULT 0,
  mst_3 NUMERIC DEFAULT 0,
  qar NUMERIC DEFAULT 0,
  lqar NUMERIC DEFAULT 0,
  assignment_marks NUMERIC DEFAULT 0,
  qar_discipline NUMERIC DEFAULT 0,
  lab_internal NUMERIC DEFAULT 0,
  lab_discipline NUMERIC DEFAULT 0,
  assign_1 BOOLEAN DEFAULT FALSE,
  assign_2 BOOLEAN DEFAULT FALSE,
  attendance_class NUMERIC DEFAULT 0,
  attendance_lab NUMERIC DEFAULT 0,
  department_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, student_id)
);

-- 10. Class Notices (Announcements)
CREATE TABLE class_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  department_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE hod_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE faculties ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_notices ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES

-- 1. Class Enrollments
CREATE POLICY "Students can view own enrollments" ON class_enrollments FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Students can update own enrollment status" ON class_enrollments FOR UPDATE USING (auth.uid() = student_id) WITH CHECK (status IN ('accepted', 'rejected'));
CREATE POLICY "Staff can view department enrollments" ON class_enrollments FOR SELECT USING (department_name = (
  SELECT department_name FROM hod_profiles WHERE id = auth.uid()
  UNION
  SELECT department_name FROM faculties WHERE id = auth.uid()
  UNION
  SELECT department_name FROM department_admins WHERE id = auth.uid()
));

-- 2. Grades
CREATE POLICY "Students can view own grades" ON grades FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Faculty can manage grades" ON grades FOR ALL USING (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = grades.class_id AND classes.faculty_id = auth.uid())
);
CREATE POLICY "HODs and Admins can manage department grades" ON grades FOR ALL USING (
  department_name = (
    SELECT department_name FROM hod_profiles WHERE id = auth.uid()
    UNION
    SELECT department_name FROM department_admins WHERE id = auth.uid()
  )
);

-- 3. Faculty can post notices
CREATE POLICY "Faculty can post notices" ON class_notices FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = class_notices.class_id AND classes.faculty_id = auth.uid())
);

-- 4. General Profile Access
CREATE POLICY "Users can view their own HOD profile" ON hod_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can view their own Admin profile" ON department_admins FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can view their own Faculty profile" ON faculties FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can view their own Student profile" ON students FOR SELECT USING (auth.uid() = id);

-- 5. Department Isolation (Staff can view their department's data)
CREATE POLICY "Staff can view department batches" ON batches FOR SELECT USING (department_name = (
  SELECT department_name FROM hod_profiles WHERE id = auth.uid() UNION
  SELECT department_name FROM department_admins WHERE id = auth.uid() UNION
  SELECT department_name FROM faculties WHERE id = auth.uid()
));

CREATE POLICY "Staff can view department students" ON students FOR SELECT USING (department_name = (
  SELECT department_name FROM hod_profiles WHERE id = auth.uid() UNION
  SELECT department_name FROM department_admins WHERE id = auth.uid() UNION
  SELECT department_name FROM faculties WHERE id = auth.uid()
));

CREATE POLICY "Staff can view department subjects" ON subjects FOR SELECT USING (department_name = (
  SELECT department_name FROM hod_profiles WHERE id = auth.uid() UNION
  SELECT department_name FROM department_admins WHERE id = auth.uid() UNION
  SELECT department_name FROM faculties WHERE id = auth.uid()
));

CREATE POLICY "Staff can view department classes" ON classes FOR SELECT USING (department_name = (
  SELECT department_name FROM hod_profiles WHERE id = auth.uid() UNION
  SELECT department_name FROM department_admins WHERE id = auth.uid() UNION
  SELECT department_name FROM faculties WHERE id = auth.uid()
));
