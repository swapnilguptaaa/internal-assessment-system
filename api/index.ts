// Vercel Serverless Function entry point
import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());

// Supabase Admin Client - Lazy Initialization
let _supabaseAdmin: any = null;
function getSupabaseAdmin(): any {
  if (!_supabaseAdmin) {
    if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase credentials in environment variables.");
    }
    _supabaseAdmin = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }
  return _supabaseAdmin;
}

// API: Provision HOD
app.post("/api/provision-hod", async (req, res) => {
  const { departmentName, branchCode, email, password } = req.body;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    // 1. Check if profile already exists in hod_profiles
    const { data: existingProfile, error: checkError } = await supabaseAdmin
      .from("hod_profiles")
      .select("email_id, branch_code")
      .or(`email_id.eq.${email},branch_code.eq.${branchCode}`)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existingProfile) {
      if (existingProfile.email_id === email) {
        return res.status(400).json({ success: false, message: "An HOD with this email is already registered." });
      }
      if (existingProfile.branch_code === branchCode) {
        return res.status(400).json({ success: false, message: `Branch code '${branchCode}' is already assigned to another department.` });
      }
    }

    // 2. Create User in Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      // If user exists in Auth but not in profile (orphaned), we can handle it
      if (authError.message.includes("already been registered")) {
        return res.status(400).json({ 
          success: false, 
          message: "This email is already registered in the system (Auth). If this is an error, please contact support to clear the orphaned account." 
        });
      }
      throw authError;
    }

    // 3. Insert into hod_profiles
    const { error: profileError } = await supabaseAdmin
      .from("hod_profiles")
      .insert({
        id: authData.user.id,
        department_name: departmentName,
        branch_code: branchCode,
        email_id: email,
      });

    if (profileError) {
      // Cleanup user if profile insertion fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    res.json({ success: true, message: "HOD provisioned successfully" });
  } catch (error: any) {
    console.error("Provisioning error:", error);
    res.status(500).json({ success: false, message: error.message || "Internal server error during provisioning" });
  }
});

// API: Provision Admin
app.post("/api/provision-admin", async (req, res) => {
  const { name, email, password, departmentName } = req.body;
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) throw authError;

    const { error: profileError } = await supabaseAdmin
      .from("department_admins")
      .insert({
        id: authData.user.id,
        name,
        email_id: email,
        department_name: departmentName,
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }
    res.json({ success: true, message: "Admin provisioned successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: Provision Faculty
app.post("/api/provision-faculty", async (req, res) => {
  const { name, email, password, departmentName } = req.body;
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) throw authError;

    const { error: profileError } = await supabaseAdmin
      .from("faculties")
      .insert({
        id: authData.user.id,
        name,
        email_id: email,
        department_name: departmentName,
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }
    res.json({ success: true, message: "Faculty provisioned successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: Create Class & Bulk Enroll
app.post("/api/create-class", async (req, res) => {
  const { subjectId, facultyId, branchCode, admissionYear, startRoll, endRoll, semester, departmentName } = req.body;
  try {
    const supabaseAdmin = getSupabaseAdmin();
    
    const start = parseInt(startRoll);
    const end = parseInt(endRoll);
    if (isNaN(start) || isNaN(end) || start > end || start < 1 || end > 300) {
      throw new Error("Invalid roll number range. Must be between 1 and 300.");
    }

    // 1. Find or create batch
    let targetBatchId = null;
    let fullYear = 0;
    if (admissionYear) {
      fullYear = 2000 + parseInt(admissionYear);
      const { data: bData } = await supabaseAdmin.from('batches').select('id').eq('admission_year', fullYear).eq('department_name', departmentName).maybeSingle();
      if (bData) {
        targetBatchId = bData.id;
      } else {
        const { data: newBatch, error: batchError } = await supabaseAdmin.from('batches').insert({ admission_year: fullYear, department_name: departmentName }).select('id').single();
        if (batchError) throw batchError;
        targetBatchId = newBatch.id;
      }
    }

    // 2. Insert Class
    const { data: classData, error: classError } = await supabaseAdmin
      .from("classes")
      .insert({
        subject_id: subjectId,
        faculty_id: facultyId,
        target_batch_id: targetBatchId,
        semester,
        department_name: departmentName,
        faculty_status: 'accepted'
      })
      .select()
      .single();

    if (classError) throw classError;

    // 3. Generate expected roll numbers
    const expectedRolls = [];
    const year = admissionYear || "23";
    for (let i = start; i <= end; i++) {
      const rollStr = String(i).padStart(2, '0');
      const enrollmentNumber = `0701CS${year}10${rollStr}`;
      expectedRolls.push(enrollmentNumber);
    }

    // 4. Check existing students
    const { data: existingStudents, error: checkError } = await supabaseAdmin
      .from("students")
      .select("id, enrollment_number")
      .in("enrollment_number", expectedRolls);

    if (checkError) throw checkError;

    const existingRolls = new Set(existingStudents?.map((s: any) => s.enrollment_number) || []);
    const newRolls = expectedRolls.filter(r => !existingRolls.has(r));

    // 5. Provision missing students
    const allStudentIds: { id: string }[] = [...(existingStudents || [])];

    for (const roll of newRolls) {
      const email = `${roll.toLowerCase()}@student.uec.ac.in`;
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: `uec@${roll}`,
        email_confirm: true
      });

      if (authError) {
        if (authError.message.includes('already been registered')) {
            console.warn(`User ${email} already in Auth but missing from students. Please clean up database.`);
        } else {
            console.error(`Error provisioning ${roll}:`, authError);
        }
        continue; // Skip failed provisioning
      }

      if (authData?.user?.id) {
        const { error: stuError } = await supabaseAdmin.from("students").insert({
          id: authData.user.id,
          name: "-",
          email_id: email,
          enrollment_number: roll,
          phone_number: '0000000000',
          batch_id: targetBatchId,
          department_name: departmentName
        });
        if (stuError) {
          console.error(`Error inserting student ${roll}:`, stuError);
        } else {
          allStudentIds.push({ id: authData.user.id });
        }
      }
    }

    // 6. Bulk Enroll and Gradebook Init
    if (allStudentIds.length > 0) {
      const enrollments = allStudentIds.map(s => ({
        class_id: classData.id,
        student_id: s.id,
        status: 'accepted',
        department_name: departmentName
      }));

      const { error: enrollError } = await supabaseAdmin
        .from("class_enrollments")
        .insert(enrollments);

      if (enrollError) console.error("Enroll error:", enrollError);

      const gradesInit = allStudentIds.map(s => ({
        class_id: classData.id,
        student_id: s.id,
        department_name: departmentName
      }));

      const { error: gradesError } = await supabaseAdmin
        .from("grades")
        .upsert(gradesInit, { onConflict: "class_id,student_id" });
        
      if (gradesError) console.error("Grades init error:", gradesError);
    }

    res.json({ success: true, message: `Class created and ${allStudentIds.length} students enrolled.` });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: Provision Student
app.post("/api/provision-student", async (req, res) => {
  const { name, email, password, enrollmentNumber, phoneNumber, batchId, departmentName } = req.body;
  try {
    if (!/^\\d{4}[A-Za-z]{2}\\d{6}$/.test(enrollmentNumber)) {
      throw new Error("Invalid Enrollment Number format. It must be 12 characters exactly.");
    }

    const supabaseAdmin = getSupabaseAdmin();
    
    let userId;
    
    // Check if student with this enrollment number already exists (e.g. from Auto-Enroll)
    const { data: existingStudent } = await supabaseAdmin
      .from("students")
      .select("id")
      .eq("enrollment_number", enrollmentNumber)
      .maybeSingle();
      
    if (existingStudent) {
      userId = existingStudent.id;
      // Update the existing mapped auth user with new email and password
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email,
        password
      });
      
      if (authUpdateError) throw authUpdateError;
    } else {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) {
        if (authError.message.includes('already been registered')) {
          // Fetch existing user to get ID and update it
          const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
          const existing = users.find((u: any) => u.email === email);
          if (!existing) throw new Error("Email already registered, but fetching the user ID failed.");
          
          await supabaseAdmin.auth.admin.updateUserById(existing.id, { password });
          userId = existing.id;
        } else {
          throw authError;
        }
      } else {
        userId = authData.user.id;
      }
    }

    const { error: profileError } = await supabaseAdmin
      .from("students")
      .upsert({
        id: userId,
        name,
        email_id: email,
        enrollment_number: enrollmentNumber,
        phone_number: phoneNumber,
        batch_id: batchId,
        department_name: departmentName,
      });

    if (profileError) {
      if (!existingStudent) {
         await supabaseAdmin.auth.admin.deleteUser(userId);
      }
      throw profileError;
    }
    res.json({ success: true, message: existingStudent ? "Student account updated and provisioned successfully" : "Student provisioned successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: Enroll Student Directly
app.post("/api/enroll-student", async (req, res) => {
  const { classId, departmentName, enrollmentNumber } = req.body;
  let { studentId } = req.body;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    
    if (!classId || classId === "undefined") {
      throw new Error("Missing classId");
    }

    if (!departmentName) {
      throw new Error("Missing departmentName");
    }

    // If studentId isn't provided directly, attempt to find it via enrollmentNumber
    if (!studentId && enrollmentNumber) {
      const { data: existingStudent, error: findStuErr } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('enrollment_number', enrollmentNumber)
        .maybeSingle();

      if (findStuErr) throw findStuErr;

      if (existingStudent) {
        studentId = existingStudent.id;
      } else {
        // We need to provision a blank student
        const email = `${enrollmentNumber.toLowerCase()}@student.uec.ac.in`;
        
        // 1. Get or create batch
        let targetBatchId = null;
        let fullYear = 2000 + parseInt(enrollmentNumber.substring(6, 8));
        
        if (!isNaN(fullYear)) {
          const { data: bData } = await supabaseAdmin.from('batches').select('id').eq('admission_year', fullYear).eq('department_name', departmentName).maybeSingle();
          if (bData && bData.id) {
            targetBatchId = bData.id;
          } else {
            const { data: newBatch, error: batchError } = await supabaseAdmin.from('batches').insert({ admission_year: fullYear, department_name: departmentName }).select('id').single();
            if (batchError) throw batchError;
            if (newBatch && newBatch.id) {
               targetBatchId = newBatch.id;
            }
          }
        }

        // 2. Provision Auth User
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: `uec@${enrollmentNumber}`,
          email_confirm: true
        });

        if (authError) {
          if (authError.message.includes('already been registered')) {
            // Since there's no getUserByEmail, we query the db or loop through pages
            // Actually, we can just fetch from students again or check if we missed something.
            // But we already checked `students` table above! So if they are in auth but not students,
            // we have an orphaned auth user. We can't fetch them easily by email in auth.
            // However, Supabase users table might be accessible!
            const { data: users, error: listUserErr } = await supabaseAdmin.auth.admin.listUsers();
            const existing = (users?.users || []).find((u: any) => u.email === email);
            if (!existing) {
               // To avoid uuid "undefined", let's explicitly throw
               throw new Error("Email already registered, but fetching the user ID failed (user not in first page or orphaned). Please contact admin to clean up the orphaned auth account.");
            }
            studentId = existing.id;
          } else {
            throw authError; // bubble up
          }
        } else if (authData && authData.user) {
          studentId = authData.user.id;
        }

        if (!studentId || studentId === "undefined") {
          throw new Error("Failed to generate student ID.");
        }

        const insertPayload: any = {
          id: studentId,
          name: "-",
          email_id: email,
          enrollment_number: enrollmentNumber,
          phone_number: '0000000000',
          department_name: departmentName
        };

        if (targetBatchId && targetBatchId !== "undefined") {
           insertPayload.batch_id = targetBatchId;
        }

        // 3. Insert into students table
        const { error: stuError } = await supabaseAdmin.from("students").insert(insertPayload);

        if (stuError) {
          throw stuError;
        }
      }
    }

    if (!studentId || studentId === "undefined") {
      throw new Error("Could not determine student ID.");
    }

    const { data: existing, error: findError } = await supabaseAdmin
      .from('class_enrollments')
      .select('id, status')
      .eq('class_id', classId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (findError) throw findError;

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ success: false, message: 'Student is already enrolled in this class.' });
      }
      const { error: updateErr } = await supabaseAdmin
        .from('class_enrollments')
        .update({ status: 'accepted' })
        .eq('id', existing.id);
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from('class_enrollments')
        .insert({
          class_id: classId,
          student_id: studentId,
          status: 'accepted',
          department_name: departmentName
        });
      if (insertErr) throw insertErr;
    }

    // Ensure a blank entry in the gradebook is immediately available
    const { error: gradeErr } = await supabaseAdmin
      .from('grades')
      .upsert(
        { class_id: classId, student_id: studentId, department_name: departmentName },
        { onConflict: 'class_id,student_id', ignoreDuplicates: true }
      );
    if (gradeErr) throw gradeErr;

    res.json({ success: true, message: "Student enrolled successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: Update Grades (Bypass RLS)
app.post("/api/update-grades", async (req, res) => {
  const { updates, activeClassId, attendancePeriod } = req.body;
  try {
    if (!activeClassId || activeClassId === "undefined") {
      throw new Error("Missing or invalid activeClassId.");
    }
    const supabaseAdmin = getSupabaseAdmin();
    // 1. Upsert grades
    const { error: gradesError } = await supabaseAdmin
      .from("grades")
      .upsert(updates, { onConflict: "class_id,student_id" });
    
    if (gradesError) throw gradesError;

    // 2. Update class totals
    const { error: classError } = await supabaseAdmin
      .from("classes")
      .update({
        total_theory_classes: attendancePeriod.totalTheoryClasses,
        total_lab_sessions: attendancePeriod.totalLabSessions,
        attendance_from: attendancePeriod.from || null,
        attendance_to: attendancePeriod.to || null
      })
      .eq("id", activeClassId);
    
    if (classError) throw classError;

    res.json({ success: true, message: "Grades updated successfully" });
  } catch (error: any) {
    console.error("Update grades error:", JSON.stringify(error));
    res.status(500).json({ success: false, message: error.message || JSON.stringify(error) || "Failed to update grades" });
  }
});

export default app;
