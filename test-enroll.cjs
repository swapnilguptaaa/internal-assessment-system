const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();
const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const enrollmentNumber = "0701CS24001"; // 11 characters
  const departmentName = "Comp Sci";
  // The classId must exist, let's grab the first class we can find to be sure.
  const { data: cData } = await supabaseAdmin.from('classes').select('id').limit(1).single();
  if(!cData) {
      console.log("No class found!"); return;
  }
  const classId = cData.id;

  let studentId = undefined;

  try {
    if (!studentId && enrollmentNumber) {
      const { data: existingStudent, error: findStuErr } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('enrollment_number', enrollmentNumber)
        .maybeSingle();

      if (findStuErr) throw findStuErr;

      console.log("existing student:", existingStudent);

      if (existingStudent) {
        studentId = existingStudent.id;
      } else {
        const email = `${enrollmentNumber.toLowerCase()}@student.uec.ac.in`;
        let targetBatchId = null;
        let fullYear = 2000 + parseInt(enrollmentNumber.substring(6, 8));
        
        if (!isNaN(fullYear)) {
          const { data: bData } = await supabaseAdmin.from('batches').select('id').eq('admission_year', fullYear).eq('department_name', departmentName).maybeSingle();
          if (bData && bData.id) {
            targetBatchId = bData.id;
          } else {
            console.log("Inserting new batch", fullYear);
            const { data: newBatch, error: batchError } = await supabaseAdmin.from('batches').insert({ admission_year: fullYear, department_name: departmentName }).select('id').single();
            if (batchError) throw batchError;
            if (newBatch && newBatch.id) {
               targetBatchId = newBatch.id;
            }
          }
        }

        console.log("auth create...");
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: `uec@${enrollmentNumber}`,
          email_confirm: true
        });

        if (authError) {
          if (authError.message.includes('already been registered')) {
            const { data: users, error: listUserErr } = await supabaseAdmin.auth.admin.listUsers();
            const existing = (users?.users || []).find((u) => u.email === email);
            if (!existing) {
               throw new Error("Email already registered, but fetching the user ID failed.");
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

        const insertPayload = {
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
        
        console.log("Inserting student...", insertPayload);
        const { error: stuError } = await supabaseAdmin.from("students").insert(insertPayload);
        if (stuError) throw stuError;
      }
    }

    if (!studentId || studentId === "undefined") {
      throw new Error("Could not determine student ID.");
    }

    console.log("Checking class enrollments", classId, studentId);
    const { data: existing, error: findError } = await supabaseAdmin
      .from('class_enrollments')
      .select('id, status')
      .eq('class_id', classId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (findError) throw findError;

    if (existing) {
      console.log("Existing enrollment", existing);
      if (existing.status === 'accepted') {
        return;
      }
      const { error: updateErr } = await supabaseAdmin
        .from('class_enrollments')
        .update({ status: 'accepted' })
        .eq('id', existing.id);
      if (updateErr) throw updateErr;
    } else {
      console.log("Inserting class enrollment");
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

    console.log("Upsert grades");
    const { error: gradeErr } = await supabaseAdmin
      .from('grades')
      .upsert(
        { class_id: classId, student_id: studentId, department_name: departmentName },
        { onConflict: 'class_id,student_id', ignoreDuplicates: true }
      );
    if (gradeErr) throw gradeErr;

    console.log("SUCCESS!");
  } catch(e) {
    console.log("CAUGHT EXCEPTION:", e);
  }
})();

