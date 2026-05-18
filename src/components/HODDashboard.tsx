import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, LogOut, Loader2, Users, UserPlus, BookOpen, 
  Layout, GraduationCap, Plus, Trash2, Edit2, CheckCircle2, 
  AlertCircle, Building2, Mail, Lock, Hash, Search, Filter,
  ChevronRight, Book, Save, Download
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn, formatStudentName } from '../lib/utils';
import { addSubject } from '../actions/hodActions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Tab = 'admins' | 'faculty' | 'students' | 'subjects' | 'classes';

interface HODDashboardProps {
  user: any;
  department: string;
  onLogout: () => void;
}

const GradeInput = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <td className="px-4 py-4">
    <input 
      type="number" 
      value={value || 0} 
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-16 px-2 py-1 bg-gray-50 border border-gray-100 rounded text-center text-sm focus:outline-none focus:ring-1 focus:ring-[#5A5A40]"
    />
  </td>
);

const AttendanceInput = ({ value, total, onChange }: any) => (
  <td className="px-4 py-4">
    <div className="flex flex-col items-center gap-1">
      <select 
        value={value} 
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 text-center bg-gray-50 border border-gray-100 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#5A5A40]"
      >
        {Array.from({ length: (total || 0) + 1 }, (_, i) => (
          <option key={i} value={i}>{i}</option>
        ))}
      </select>
      {total > 0 && (
        <span className="text-[9px] font-bold text-gray-400">
          {Math.round((value / total) * 100)}%
        </span>
      )}
    </div>
  </td>
);

export const HODDashboard: React.FC<HODDashboardProps> = ({ user, department, onLogout }) => {
  const [activeTab, setActiveTab] = useState<Tab>('admins');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Data States
  const [admins, setAdmins] = useState<any[]>([]);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<number>(1);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [activeClass, setActiveClass] = useState<any>(null);
  const [classGrades, setClassGrades] = useState<any[]>([]);
  const [attendancePeriod, setAttendancePeriod] = useState({ from: '', to: '', totalClasses: 0, totalLabs: 0 });

  // Form States
  const [adminForm, setAdminForm] = useState({ name: '', email: '', password: '' });
  const [facultyForm, setFacultyForm] = useState({ name: '', email: '', password: '' });
  const [subjectForm, setSubjectForm] = useState({ subject_code: '', subject_name: '' });
  const [classForm, setClassForm] = useState({ subjectId: '', facultyId: '', branchCode: '', admissionYear: '', startRoll: '', endRoll: '' });
  const [editStudent, setEditStudent] = useState<any>(null);
  const [selectedStudentGradebook, setSelectedStudentGradebook] = useState<any>(null);
  const [studentGradesData, setStudentGradesData] = useState<any[]>([]);
  const [quickStudentForm, setQuickStudentForm] = useState({
    name: '', email: '', password: '', enrollmentNumber: '', phoneNumber: '', batchId: ''
  });

  useEffect(() => {
    if (activeTab === 'admins') fetchAdmins();
    if (activeTab === 'faculty') fetchFaculties();
    if (activeTab === 'students') fetchBatches();
    if (activeTab === 'subjects') fetchSubjects();
    if (activeTab === 'classes') {
      fetchSubjects();
      fetchFaculties();
      fetchBatches();
      fetchClasses();
    }
  }, [activeTab, selectedSemester, department]);

  useEffect(() => {
    if (activeClass) {
      fetchClassGrades();
      setAttendancePeriod({
        totalClasses: activeClass.total_theory_classes || 0,
        totalLabs: activeClass.total_lab_sessions || 0,
        from: activeClass.attendance_from || '',
        to: activeClass.attendance_to || ''
      });
    }
  }, [activeClass]);

  // --- FETCHERS ---
  const fetchClassGrades = async () => {
    // 1. Fetch all accepted students for this class
    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select('student_id, students(name, enrollment_number)')
      .eq('class_id', activeClass.id)
      .eq('status', 'accepted');

    // 2. Fetch existing grades
    const { data: existingGrades } = await supabase
      .from('grades')
      .select('*')
      .eq('class_id', activeClass.id);

    // 3. Merge: Ensure every accepted student has a row in the gradebook
    const mergedGrades = (enrollments || []).map(enr => {
      const existing = (existingGrades || []).find(g => g.student_id === enr.student_id);
      return {
        ...(existing || {
          mst_1: 0, mst_2: 0, qar: 0, lqar: 0,
          assignment_marks: 0, qar_discipline: 0,
          lab_internal: 0, lab_discipline: 0,
          attendance_class: 0, attendance_lab: 0
        }),
        student_id: enr.student_id,
        students: enr.students
      };
    });

    setClassGrades(mergedGrades);
  };

  const handleUpdateGrades = async () => {
    setLoading(true);
    try {
      const updates = classGrades.map(g => {
        const row: any = {
          class_id: activeClass.id,
          student_id: g.student_id,
          mst_1: Number(g.mst_1) || 0,
          mst_2: Number(g.mst_2) || 0,
          qar: calculateQAR(g.attendance_class, attendancePeriod.totalClasses, g.assignment_marks, g.qar_discipline),
          lqar: calculateLQAR(g.attendance_lab, attendancePeriod.totalLabs, g.lab_internal, g.lab_discipline),
          assignment_marks: Number(g.assignment_marks) || 0,
          qar_discipline: Number(g.qar_discipline) || 0,
          lab_internal: Number(g.lab_internal) || 0,
          lab_discipline: Number(g.lab_discipline) || 0,
          attendance_class: Number(g.attendance_class) || 0,
          attendance_lab: Number(g.attendance_lab) || 0,
          department_name: department
        };
        return row;
      });

      const { error } = await supabase.from('grades').upsert(updates, { onConflict: 'class_id,student_id' });
      if (error) throw error;

      // Update class totals
      const { error: classError } = await supabase
        .from('classes')
        .update({
          total_theory_classes: attendancePeriod.totalClasses,
          total_lab_sessions: attendancePeriod.totalLabs,
          attendance_from: attendancePeriod.from || null,
          attendance_to: attendancePeriod.to || null
        })
        .eq('id', activeClass.id);
      if (classError) throw classError;

      setMessage({ type: 'success', text: 'Grades overridden successfully' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!/^\d{4}[A-Za-z]{2}\d{5,6}$/.test(quickStudentForm.enrollmentNumber)) {
        throw new Error("Invalid Enrollment Number format. It must be 11 or 12 characters, e.g., '0701CS231009'.");
      }

      const res = await fetch('/api/provision-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...quickStudentForm, departmentName: department })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setQuickStudentForm({ name: '', email: '', password: '', enrollmentNumber: '', phoneNumber: '', batchId: '' });
        if (selectedBatchId) fetchStudentsByBatch(selectedBatchId);
      } else throw new Error(data.message);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // --- FETCHERS ---
  const fetchAdmins = async () => {
    const { data } = await supabase.from('department_admins').select('*').eq('department_name', department);
    setAdmins(data || []);
  };

  const fetchFaculties = async () => {
    const { data } = await supabase.from('faculties').select('*').eq('department_name', department);
    setFaculties(data || []);
  };

  const fetchBatches = async () => {
    const { data } = await supabase.from('batches').select('*').eq('department_name', department).order('admission_year', { ascending: false });
    setBatches(data || []);
  };

  const fetchStudentsByBatch = async (batchId: string) => {
    const { data } = await supabase.from('students').select('*').eq('batch_id', batchId).eq('department_name', department);
    setStudents(data || []);
  };

  const fetchSubjects = async () => {
    const { data } = await supabase.from('subjects').select('*').eq('department_name', department).eq('semester', selectedSemester);
    setSubjects(data || []);
  };

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('*, subjects(subject_name, subject_code), faculties(name)')
      .eq('department_name', department)
      .eq('semester', selectedSemester);
    setClasses(data || []);
  };

  // --- ACTIONS ---
  const handleViewStudentGradebook = async (student: any) => {
    setSelectedStudentGradebook(student);
    setLoading(true);
    try {
      const { data } = await supabase
        .from('grades')
        .select(`
          *,
          classes (
            semester,
            subjects (
              subject_name,
              subject_code
            )
          )
        `)
        .eq('student_id', student.id);
      
      setStudentGradesData(data || []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const exportStudentPDF = async () => {
    if (!selectedStudentGradebook) return;
    setLoading(true);
    try {
      const doc = new jsPDF();
      let currentY = 15;

      try {
        const img = new Image();
        img.src = '/uec-header.png';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        const imgWidth = 190;
        const imgHeight = (img.height * imgWidth) / img.width;
        doc.addImage(img, 'PNG', 10, 10, imgWidth, imgHeight);
        currentY = 10 + imgHeight + 10;
      } catch (e) {
        console.error("Header image loading failed", e);
      }

      doc.setFontSize(14);
      doc.text(`Gradebook: ${formatStudentName(selectedStudentGradebook.name)}`, 14, currentY);
      
      // Legend at Top Right
      const pageWidth = doc.internal.pageSize.width;
      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.text("M1/M2/M3: Mid Sem Tests | B.M: Best MST | Asg: Assignment", pageWidth - 14, currentY - 2, { align: 'right' });
      doc.text("QD: QAR Discipline | LI: Lab Internal | LD: Lab Discip.", pageWidth - 14, currentY + 2, { align: 'right' });
      doc.setTextColor(0);

      currentY += 7;
      doc.setFontSize(11);
      doc.text(`Enrollment No: ${selectedStudentGradebook.enrollment_number}`, 14, currentY);
      currentY += 8;
      
      const tableData = studentGradesData.map(g => [
        g.classes?.subjects?.subject_name || '-',
        g.classes?.semester || '-',
        g.mst_1 || 0,
        g.mst_2 || 0,
        g.mst_3 || 0,
        calculateBestMST(g.mst_1, g.mst_2, g.mst_3),
        g.qar || 0,
        g.lqar || 0,
        g.assignment_marks || 0,
        g.qar_discipline || 0,
        g.lab_internal || 0,
        g.lab_discipline || 0
      ]);

      autoTable(doc, {
        startY: currentY,
        margin: { left: 5, right: 5 },
        head: [['Subject', 'Sem', 'M1', 'M2', 'M3', 'B.M', 'QAR', 'LQAR', 'Asg', 'QD', 'LI', 'LD']],
        body: tableData,
        styles: { fontSize: 10, cellPadding: 1, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 50, halign: 'left' }
        },
        headStyles: { fillColor: [90, 90, 64], halign: 'center', fontSize: 9 },
        didDrawPage: function (data: any) {
          const centerX = doc.internal.pageSize.getWidth() / 2;
          const centerY = doc.internal.pageSize.getHeight() / 2;
          doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
          doc.addImage('/watermark.jpeg', 'JPEG', centerX - 50, centerY - 50, 100, 100);
          doc.setGState(new (doc as any).GState({ opacity: 1.0 }));
        }
      });
      
      doc.save(`${selectedStudentGradebook.enrollment_number}_grades.pdf`);
    } finally {
      setLoading(false);
    }
  };

  const calculateBestMST = (mst1: number, mst2: number, mst3: number) => {
    return Math.max(Number(mst1) || 0, Math.max(Number(mst2) || 0, Number(mst3) || 0));
  };

  const calculateQAR = (attended: number, totalClasses: number, assignMarks: number, discipline: number) => {
    const classVal = Number(totalClasses) || 0;
    const attVal = Number(attended) || 0;
    const attendanceScore = classVal > 0 ? Math.min((attVal / classVal) * 7, 7) : 0;
    const total = attendanceScore + (Number(assignMarks) || 0) + (Number(discipline) || 0);
    const finalVal = Math.min(total, 10);
    return isNaN(finalVal) ? "0.00" : finalVal.toFixed(2);
  };

  const calculateLQAR = (labAttended: number, totalLabs: number, internalMarks: number, discipline: number) => {
    const classVal = Number(totalLabs) || 0;
    const attVal = Number(labAttended) || 0;
    const labAttendanceScore = classVal > 0 ? Math.min((attVal / classVal) * 10, 10) : 0;
    const total = labAttendanceScore + (Number(internalMarks) || 0) + (Number(discipline) || 0);
    const finalVal = Math.min(total, 20);
    return isNaN(finalVal) ? "0.00" : finalVal.toFixed(2);
  };

  const exportClassGradebookPDF = async () => {
    if (!activeClass || !classGrades) return;
    setLoading(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait' });
      let currentY = 15;
      let headerImg: HTMLImageElement | null = null;
      let imgWidth = 0;
      let imgHeight = 0;

      try {
        headerImg = new Image();
        headerImg.src = '/uec-header.png';
        await new Promise((resolve, reject) => {
          if (!headerImg) return reject();
          headerImg.onload = resolve;
          headerImg.onerror = reject;
        });
        
        imgWidth = 190; // Fit portrait
        imgHeight = (headerImg.height * imgWidth) / headerImg.width;
        doc.addImage(headerImg, 'PNG', 10, 10, imgWidth, imgHeight);
        currentY = 10 + imgHeight + 10;
      } catch (e) {
        console.error("Header image loading failed", e);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Ujjain Engineering College, Ujjain', doc.internal.pageSize.width / 2, currentY, { align: 'center' });
        currentY += 15;
      }

      doc.setFontSize(14);
      doc.text(`Gradebook: ${activeClass.subjects?.subject_name} (${activeClass.subjects?.subject_code})`, 8, currentY);
      
      // Legend at Top Right
      const pageWidth = doc.internal.pageSize.width;
      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.text("M1/M2/M3: Mid Sem Tests | B.M: Best MST | Asg: Assignment", pageWidth - 5, currentY - 2, { align: 'right' });
      doc.text("QD: QAR Discipline | AC: Attend Class | QAR: Quiz & Assign. Record", pageWidth - 5, currentY + 2, { align: 'right' });
      doc.text("AL: Attend Lab | LI: Lab Internal | LD: Lab Discip. | LQR: Lab QAR", pageWidth - 5, currentY + 6, { align: 'right' });
      doc.setTextColor(0);

      currentY += 7;
      doc.setFontSize(11);
      doc.text(`Semester: ${activeClass.semester} | Department: ${department}`, 8, currentY);
      currentY += 8;

      const tableData = classGrades.map((g, index) => {
        const bestMst = calculateBestMST(g.mst_1, g.mst_2, g.mst_3);
        const qarValue = calculateQAR(g.attendance_class, attendancePeriod.totalClasses, g.assignment_marks, g.qar_discipline);
        const lqarValue = calculateLQAR(g.attendance_lab, attendancePeriod.totalLabs, g.lab_internal, g.lab_discipline);

        return [
          index + 1,
          formatStudentName(g.students?.name),
          g.students?.enrollment_number || '-',
          g.mst_1 || 0,
          g.mst_2 || 0,
          g.mst_3 || 0,
          bestMst,
          g.assignment_marks || 0,
          g.qar_discipline || 0,
          g.attendance_class || 0,
          qarValue,
          g.attendance_lab || 0,
          g.lab_internal || 0,
          g.lab_discipline || 0,
          lqarValue
        ];
      });

      autoTable(doc, {
        startY: currentY,
        margin: { left: 5, right: 5 },
        head: [['#', 'Name', 'Enroll No.', 'M1', 'M2', 'M3', 'B.M', 'Asg', 'QD', 'AC', 'QAR', 'AL', 'LI', 'LD', 'LQR']],
        body: tableData,
        styles: { fontSize: 10, cellPadding: 0.8, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 22, halign: 'left' },
          2: { cellWidth: 32, halign: 'center' }
        },
        headStyles: { fillColor: [90, 90, 64], halign: 'center', fontSize: 9 },
        didDrawPage: function (data: any) {
          const centerX = doc.internal.pageSize.getWidth() / 2;
          const centerY = doc.internal.pageSize.getHeight() / 2;
          doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
          doc.addImage('/watermark.jpeg', 'JPEG', centerX - 50, centerY - 50, 100, 100);
          doc.setGState(new (doc as any).GState({ opacity: 1.0 }));
        }
      });
      
      // Formulas Page
      doc.addPage();
      let y = 35;

      if (headerImg) {
        doc.addImage(headerImg, 'PNG', 10, 10, 190, (headerImg.height * 190) / headerImg.width);
        y = 10 + ((headerImg.height * 190) / headerImg.width) + 10;
      }

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Evaluation Formulas & Criteria', 10, y);
      y += 15;

      doc.setFontSize(12);
      doc.setFont('times', 'italic');
      
      doc.setFont('helvetica', 'bold');
      doc.text('1. Best of 3 MSTs:', 10, y);
      doc.setFont('times', 'italic');
      y += 8;
      doc.text('Formula: MAX(MST 1, MST 2, MST 3)', 16, y);
      y += 15;

      doc.setFont('helvetica', 'bold');
      doc.text('2. QAR (Quantitative Assessment Rubric) - Max 10 Marks:', 10, y);
      doc.setFont('times', 'italic');
      y += 8;
      doc.text('Formula: ((Theory Attendance / Total Theory Classes) * 7) + Assignment Marks + Discipline', 16, y);
      y += 8;
      doc.setFont('helvetica', 'normal');
      doc.text('Components:', 16, y);
      y += 6;
      doc.setFontSize(10);
      doc.text('- Attendance: Max 7 Marks', 20, y);
      y += 6;
      doc.text('- Assignment: Max 2 Marks', 20, y);
      y += 6;
      doc.text('- Discipline: Max 1 Mark', 20, y);
      doc.setFontSize(12);
      y += 8;
      doc.text('Constraints: Maximum total score is capped at 10.', 16, y);
      y += 15;

      doc.setFont('helvetica', 'bold');
      doc.text('3. LQAR (Lab Quantitative Assessment Rubric) - Max 20 Marks:', 10, y);
      doc.setFont('times', 'italic');
      y += 8;
      doc.text('Formula: ((Lab Attendance / Total Lab Sessions) * 10) + Lab Internal + Lab Discipline', 16, y);
      y += 8;
      doc.setFont('helvetica', 'normal');
      doc.text('Components:', 16, y);
      y += 6;
      doc.setFontSize(10);
      doc.text('- Lab Attendance: Max 10 Marks', 20, y);
      y += 6;
      doc.text('- Lab Internal: Max 8 Marks', 20, y);
      y += 6;
      doc.text('- Lab Discipline: Max 2 Marks', 20, y);
      doc.setFontSize(12);
      y += 8;
      doc.text('Constraints: Maximum total score is capped at 20.', 16, y);

      // Add watermark to formulas page
      const centerX = doc.internal.pageSize.getWidth() / 2;
      const centerY = doc.internal.pageSize.getHeight() / 2;
      doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
      doc.addImage('/watermark.jpeg', 'JPEG', centerX - 50, centerY - 50, 100, 100);
      doc.setGState(new (doc as any).GState({ opacity: 1.0 }));

      doc.save(`${activeClass.subjects?.subject_code}_class_grades.pdf`);
    } finally {
      setLoading(false);
    }
  };

  const handleProvisionAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/provision-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...adminForm, departmentName: department })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setAdminForm({ name: '', email: '', password: '' });
        fetchAdmins();
      } else throw new Error(data.message);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleProvisionFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/provision-faculty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...facultyForm, departmentName: department })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setFacultyForm({ name: '', email: '', password: '' });
        fetchFaculties();
      } else throw new Error(data.message);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addSubject({
        ...subjectForm,
        semester: selectedSemester,
        department_name: department
      });
      setMessage({ type: 'success', text: 'Subject added successfully' });
      setSubjectForm({ subject_code: '', subject_name: '' });
      fetchSubjects();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/create-class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...classForm, semester: selectedSemester, departmentName: department })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setClassForm({ subjectId: '', facultyId: '', branchCode: '', admissionYear: '', startRoll: '', endRoll: '' });
        fetchClasses();
      } else throw new Error(data.message);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!/^\d{4}[A-Za-z]{2}\d{5,6}$/.test(editStudent.enrollment_number)) {
        throw new Error("Invalid Enrollment Number format. It must be 11 or 12 characters, e.g., '0701CS231009'.");
      }

      const { error } = await supabase
        .from('students')
        .update({
          name: editStudent.name,
          enrollment_number: editStudent.enrollment_number,
          email: editStudent.email,
          phone_number: editStudent.phone_number
        })
        .eq('id', editStudent.id);
      
      if (error) throw error;
      setMessage({ type: 'success', text: 'Student updated successfully' });
      setEditStudent(null);
      fetchStudentsByBatch(selectedBatchId);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex font-sans">
      {/* Sidebar */}
      <aside className="w-72 bg-[#1A1A1A] text-white flex flex-col shadow-2xl sticky top-0 h-screen">
        <div className="p-8 border-b border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#5A5A40] rounded-xl flex items-center justify-center shadow-lg">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <span className="font-serif text-xl tracking-tight">HOD Portal</span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">{department}</p>
        </div>

        <nav className="flex-1 p-6 space-y-2 overflow-y-auto">
          {[
            { id: 'admins', label: 'Admins', icon: ShieldCheck },
            { id: 'faculty', label: 'Faculty', icon: Users },
            { id: 'students', label: 'Students', icon: GraduationCap },
            { id: 'subjects', label: 'Subjects', icon: Book },
            { id: 'classes', label: 'Classes', icon: Layout },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as Tab)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                activeTab === t.id ? "bg-white/10 text-white shadow-sm" : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              <t.icon className={cn("w-5 h-5", activeTab === t.id ? "text-[#5A5A40]" : "text-gray-500")} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="p-6 border-t border-white/10">
          <div className="flex items-center gap-3 px-4 py-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold uppercase text-white">
              {(user.profile?.name || user.email)[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate text-white">{user.profile?.name || 'HOD User'}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all text-sm font-medium"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-12 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <header className="mb-12 flex justify-between items-end">
            <div>
              <h1 className="text-4xl font-serif text-[#1A1A1A] mb-2">
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Management
              </h1>
              <p className="text-gray-500 italic">Manage your department's {activeTab} and academic structure.</p>
            </div>
            {message && (
              <div className={cn(
                "flex items-center gap-2 text-sm p-4 rounded-xl animate-in fade-in slide-in-from-top-2",
                message.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              )}>
                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                {message.text}
              </div>
            )}
          </header>

          {/* TAB: ADMINS */}
          {activeTab === 'admins' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              <div className="lg:col-span-1">
                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
                  <h2 className="text-xl font-serif mb-6 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-[#5A5A40]" />
                    Provision Admin
                  </h2>
                  <form onSubmit={handleProvisionAdmin} className="space-y-5">
                    <Input label="Full Name" value={adminForm.name} onChange={v => setAdminForm({...adminForm, name: v})} icon={Users} placeholder="John Doe" />
                    <Input label="Official Email" type="email" value={adminForm.email} onChange={v => setAdminForm({...adminForm, email: v})} icon={Mail} placeholder="admin@uecu.ac.in" />
                    <Input label="Password" type="password" value={adminForm.password} onChange={v => setAdminForm({...adminForm, password: v})} icon={Lock} placeholder="••••••••" />
                    <Button loading={loading} label="Create Admin" />
                  </form>
                </div>
              </div>
              <div className="lg:col-span-2">
                <DataTable 
                  title="Department Admins" 
                  headers={['Name', 'Email']} 
                  data={admins.map(a => [a.name, a.email_id])} 
                />
              </div>
            </div>
          )}

          {/* TAB: FACULTY */}
          {activeTab === 'faculty' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              <div className="lg:col-span-1">
                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
                  <h2 className="text-xl font-serif mb-6 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-[#5A5A40]" />
                    Provision Faculty
                  </h2>
                  <form onSubmit={handleProvisionFaculty} className="space-y-5">
                    <Input label="Full Name" value={facultyForm.name} onChange={v => setFacultyForm({...facultyForm, name: v})} icon={Users} placeholder="Dr. Smith" />
                    <Input label="Official Email" type="email" value={facultyForm.email} onChange={v => setFacultyForm({...facultyForm, email: v})} icon={Mail} placeholder="faculty@uecu.ac.in" />
                    <Input label="Password" type="password" value={facultyForm.password} onChange={v => setFacultyForm({...facultyForm, password: v})} icon={Lock} placeholder="••••••••" />
                    <Button loading={loading} label="Create Faculty" />
                  </form>
                </div>
              </div>
              <div className="lg:col-span-2">
                <DataTable 
                  title="Department Faculty" 
                  headers={['Name', 'Email']} 
                  data={faculties.map(f => [f.name, f.email_id])} 
                />
              </div>
            </div>
          )}

          {/* TAB: STUDENTS */}
          {activeTab === 'students' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              <div className="lg:col-span-1">
                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
                  <h2 className="text-xl font-serif mb-6 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-[#5A5A40]" />
                    Quick Add Student
                  </h2>
                  <form onSubmit={handleQuickAddStudent} className="space-y-4">
                    <Input label="Name" value={quickStudentForm.name} onChange={v => setQuickStudentForm({...quickStudentForm, name: v})} icon={Users} />
                    <Input label="Enrollment" value={quickStudentForm.enrollmentNumber} onChange={v => setQuickStudentForm({...quickStudentForm, enrollmentNumber: v})} icon={Hash} placeholder="e.g. 0701CS231009" />
                    <Input label="Email" type="email" value={quickStudentForm.email} onChange={v => setQuickStudentForm({...quickStudentForm, email: v})} icon={Mail} />
                    <Input label="Password" type="password" value={quickStudentForm.password} onChange={v => setQuickStudentForm({...quickStudentForm, password: v})} icon={Lock} />
                    <Select 
                      label="Batch" 
                      value={quickStudentForm.batchId} 
                      onChange={v => setQuickStudentForm({...quickStudentForm, batchId: v})}
                      options={batches.map(b => ({ value: b.id, label: `${b.admission_year} Batch` }))}
                    />
                    <Button loading={loading} label="Onboard Student" />
                  </form>
                </div>
              </div>
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 flex items-center gap-6">
                  <div className="flex-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">Select Batch (Admission Year)</label>
                    <select 
                      value={selectedBatchId}
                      onChange={(e) => {
                        setSelectedBatchId(e.target.value);
                        fetchStudentsByBatch(e.target.value);
                      }}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all text-sm"
                    >
                      <option value="">Select a batch...</option>
                      {batches.map(b => (
                        <option key={b.id} value={b.id}>{b.admission_year} - {b.section || 'General'}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="px-8 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Name</th>
                        <th className="px-8 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Enrollment</th>
                        <th className="px-8 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {students.map(s => (
                        <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-8 py-5 text-sm font-medium text-gray-900">{formatStudentName(s.name)}</td>
                          <td className="px-8 py-5 text-sm text-gray-500 font-mono">{s.enrollment_number}</td>
                          <td className="px-8 py-5 text-sm">
                            <div className="flex items-center gap-2">
                              <button onClick={() => setEditStudent(s)} className="p-2 text-gray-400 hover:text-[#5A5A40] hover:bg-[#5A5A40]/5 rounded-lg transition-all" title="Edit Student">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleViewStudentGradebook(s)} className="p-2 text-gray-400 hover:text-[#5A5A40] hover:bg-[#5A5A40]/5 rounded-lg transition-all" title="View Gradebook">
                                <BookOpen className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SUBJECTS */}
          {activeTab === 'subjects' && (
            <div className="space-y-8">
              <SemesterSelector selected={selectedSemester} onSelect={setSelectedSemester} />
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-1">
                  <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
                    <h2 className="text-xl font-serif mb-6 flex items-center gap-2">
                      <Plus className="w-5 h-5 text-[#5A5A40]" />
                      Add Subject
                    </h2>
                    <form onSubmit={handleAddSubject} className="space-y-5">
                      <Input label="Subject Code" value={subjectForm.subject_code} onChange={v => setSubjectForm({...subjectForm, subject_code: v})} icon={Hash} placeholder="CS-401" />
                      <Input label="Subject Name" value={subjectForm.subject_name} onChange={v => setSubjectForm({...subjectForm, subject_name: v})} icon={BookOpen} placeholder="Operating Systems" />
                      <Button loading={loading} label="Add to Semester" />
                    </form>
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <DataTable 
                    title={`Subjects - Semester ${selectedSemester}`} 
                    headers={['Code', 'Name']} 
                    data={subjects.map(s => [s.subject_code, s.subject_name])} 
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB: CLASSES */}
          {activeTab === 'classes' && (
            <div className="space-y-8">
              <SemesterSelector selected={selectedSemester} onSelect={setSelectedSemester} />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-1">
                  <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
                    <h2 className="text-xl font-serif mb-6 flex items-center gap-2">
                      <Layout className="w-5 h-5 text-[#5A5A40]" />
                      Create Classroom
                    </h2>
                    <form onSubmit={handleCreateClass} className="space-y-5">
                      <Select 
                        label="Subject" 
                        value={classForm.subjectId} 
                        onChange={v => setClassForm({...classForm, subjectId: v})}
                        options={subjects.map(s => ({ value: s.id, label: `${s.subject_code} - ${s.subject_name}` }))}
                      />
                      <Select 
                        label="Faculty" 
                        value={classForm.facultyId} 
                        onChange={v => setClassForm({...classForm, facultyId: v})}
                        options={faculties.map(f => ({ value: f.id, label: f.name }))}
                      />
                      
                      <div className="grid grid-cols-2 gap-4">
                        <Input 
                          label="Admission Year (e.g., 23)" 
                          type="number"
                          value={classForm.admissionYear} 
                          onChange={(v: any) => setClassForm({...classForm, admissionYear: v})} 
                          placeholder="23"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Input 
                          label="Start Roll No" 
                          type="number"
                          value={classForm.startRoll} 
                          onChange={(v: any) => setClassForm({...classForm, startRoll: v})} 
                          placeholder="1"
                        />
                        <Input 
                          label="End Roll No" 
                          type="number"
                          value={classForm.endRoll} 
                          onChange={(v: any) => setClassForm({...classForm, endRoll: v})} 
                          placeholder="80"
                        />
                      </div>
                      
                      <Button loading={loading} label="Create & Auto-Enroll" />
                    </form>
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <DataTable 
                    title={`Classes - Semester ${selectedSemester}`} 
                    headers={['Subject', 'Faculty', 'Status', 'Action']} 
                    data={classes.map(c => [
                      c.subjects?.subject_name || 'N/A', 
                      c.faculties?.name || 'N/A',
                      <span key={c.id} className={cn(
                        "px-2 py-1 rounded text-[10px] font-bold uppercase",
                        c.faculty_status === 'pending' ? "bg-yellow-50 text-yellow-600" : "bg-green-50 text-green-600"
                      )}>{c.faculty_status}</span>,
                      <button 
                        key={`btn-${c.id}`}
                        onClick={() => setActiveClass(c)}
                        className="text-[10px] font-bold uppercase text-[#5A5A40] hover:underline"
                      >
                        View Gradebook
                      </button>
                    ])} 
                  />
                </div>
              </div>

              {/* Gradebook Override Modal */}
              {activeClass && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                  <div className="bg-white w-full max-w-6xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                      <div className="flex items-center gap-8">
                        <div>
                          <h2 className="text-2xl font-serif">{activeClass.subjects?.subject_name} - Gradebook</h2>
                          <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">HOD Override Mode</p>
                        </div>
                        <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-gray-100">
                          <div>
                            <p className="text-[10px] font-bold uppercase text-gray-400">Attendance Period</p>
                            <div className="flex items-center gap-2 mt-1">
                              <input 
                                type="date" 
                                value={attendancePeriod.from} 
                                onChange={(e) => setAttendancePeriod(prev => ({ ...prev, from: e.target.value }))}
                                className="text-xs bg-gray-50 border-none rounded p-1 focus:ring-1 focus:ring-[#5A5A40]"
                              />
                              <span className="text-gray-400 text-xs">to</span>
                              <input 
                                type="date" 
                                value={attendancePeriod.to} 
                                onChange={(e) => setAttendancePeriod(prev => ({ ...prev, to: e.target.value }))}
                                className="text-xs bg-gray-50 border-none rounded p-1 focus:ring-1 focus:ring-[#5A5A40]"
                              />
                            </div>
                          </div>
                          <div className="border-l border-gray-100 pl-4">
                            <p className="text-[10px] font-bold uppercase text-gray-400">Total Classes</p>
                            <input 
                              type="number" 
                              min="0"
                              value={attendancePeriod.totalClasses} 
                              onChange={(e) => setAttendancePeriod(prev => ({ ...prev, totalClasses: parseInt(e.target.value) || 0 }))}
                              className="w-16 mt-1 text-xs bg-gray-50 border-none rounded p-1 focus:ring-1 focus:ring-[#5A5A40] text-center font-bold"
                            />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase text-gray-400">Total Labs</p>
                            <input 
                              type="number" 
                              min="0"
                              value={attendancePeriod.totalLabs} 
                              onChange={(e) => setAttendancePeriod(prev => ({ ...prev, totalLabs: parseInt(e.target.value) || 0 }))}
                              className="w-16 mt-1 text-xs bg-gray-50 border-none rounded p-1 focus:ring-1 focus:ring-[#5A5A40] text-center font-bold"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <button 
                          onClick={exportClassGradebookPDF}
                          className="px-6 py-3 bg-white text-[#5A5A40] border border-[#5A5A40] rounded-xl font-bold text-sm shadow-sm hover:bg-gray-50 transition-all flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Save to PDF
                        </button>
                        <button 
                          onClick={handleUpdateGrades}
                          disabled={loading}
                          className="px-6 py-3 bg-[#5A5A40] text-white rounded-xl font-bold text-sm shadow-lg hover:bg-[#4A4A30] transition-all flex items-center gap-2"
                        >
                          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Save Overrides
                        </button>
                        <button 
                          onClick={() => setActiveClass(null)}
                          className="px-6 py-3 bg-gray-200 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-300 transition-all"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto p-8">
                      <table className="w-full text-left border-collapse min-w-[1000px]">
                        <thead>
                          <tr className="bg-gray-50/50">
                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 sticky left-0 bg-gray-50 z-10">Student</th>
                            <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">MST 1</th>
                            <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">MST 2</th>
                            <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">MST 3</th>
                            <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center bg-gray-100">Best MST</th>
                            <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">QAR</th>
                            <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">LQAR</th>
                            <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Assign.</th>
                            <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Discip.</th>
                            <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Att (C)</th>
                            <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Att (L)</th>
                            <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Lab Int.</th>
                            <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Lab Disc.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {classGrades.map(g => (
                            <tr key={g.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-4 sticky left-0 bg-white z-10 border-r border-gray-100">
                                <p className="text-sm font-medium text-gray-900">{formatStudentName(g.students?.name)}</p>
                                <p className="text-[10px] font-mono text-gray-400">{g.students?.enrollment_number}</p>
                              </td>
                              <GradeInput value={g.mst_1} onChange={v => setClassGrades(prev => prev.map(pg => pg.id === g.id ? {...pg, mst_1: Math.max(0, Math.min(Number(v), 20))} : pg))} />
                              <GradeInput value={g.mst_2} onChange={v => setClassGrades(prev => prev.map(pg => pg.id === g.id ? {...pg, mst_2: Math.max(0, Math.min(Number(v), 20))} : pg))} />
                              <GradeInput value={g.mst_3} onChange={v => setClassGrades(prev => prev.map(pg => pg.id === g.id ? {...pg, mst_3: Math.max(0, Math.min(Number(v), 20))} : pg))} />
                              <td className="px-4 py-4 text-center bg-gray-50 font-bold text-gray-700">
                                {calculateBestMST(g.mst_1, g.mst_2, g.mst_3)}
                              </td>
                              <td className="px-4 py-4 text-center bg-gray-50 font-bold text-[#5A5A40]">
                                {calculateQAR(g.attendance_class, attendancePeriod.totalClasses, g.assignment_marks, g.qar_discipline)}
                              </td>
                              <td className="px-4 py-4 text-center bg-gray-50 font-bold text-[#5A5A40]">
                                {calculateLQAR(g.attendance_lab, attendancePeriod.totalLabs, g.lab_internal, g.lab_discipline)}
                              </td>
                              <GradeInput value={g.assignment_marks} onChange={v => setClassGrades(prev => prev.map(pg => pg.id === g.id ? {...pg, assignment_marks: Math.max(0, Math.min(Number(v), 2))} : pg))} />
                              <GradeInput value={g.qar_discipline} onChange={v => setClassGrades(prev => prev.map(pg => pg.id === g.id ? {...pg, qar_discipline: Math.max(0, Math.min(Number(v), 1))} : pg))} />
                              <AttendanceInput 
                                value={g.attendance_class} 
                                total={attendancePeriod.totalClasses} 
                                onChange={v => setClassGrades(prev => prev.map(pg => pg.id === g.id ? {...pg, attendance_class: Math.max(0, v)} : pg))} 
                              />
                              <AttendanceInput 
                                value={g.attendance_lab} 
                                total={attendancePeriod.totalLabs} 
                                onChange={v => setClassGrades(prev => prev.map(pg => pg.id === g.id ? {...pg, attendance_lab: Math.max(0, v)} : pg))} 
                              />
                              <GradeInput value={g.lab_internal} onChange={v => setClassGrades(prev => prev.map(pg => pg.id === g.id ? {...pg, lab_internal: Math.max(0, Math.min(Number(v), 8))} : pg))} />
                              <GradeInput value={g.lab_discipline} onChange={v => setClassGrades(prev => prev.map(pg => pg.id === g.id ? {...pg, lab_discipline: Math.max(0, Math.min(Number(v), 2))} : pg))} />
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Edit Student Modal */}
      {editStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden p-10">
            <h2 className="text-2xl font-serif mb-8">Edit Student Details</h2>
            <form onSubmit={handleUpdateStudent} className="space-y-5">
              <Input label="Name" value={editStudent.name} onChange={v => setEditStudent({...editStudent, name: v})} icon={Users} />
              <Input label="Enrollment" value={editStudent.enrollment_number} onChange={v => setEditStudent({...editStudent, enrollment_number: v})} icon={Hash} />
              <Input label="Email" value={editStudent.email} onChange={v => setEditStudent({...editStudent, email: v})} icon={Mail} />
              <Input label="Phone" value={editStudent.phone_number} onChange={v => setEditStudent({...editStudent, phone_number: v})} icon={Hash} />
              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setEditStudent(null)}
                  className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <Button loading={loading} label="Save Changes" />
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Gradebook Modal */}
      {selectedStudentGradebook && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h2 className="text-2xl font-serif">{formatStudentName(selectedStudentGradebook.name)}</h2>
                <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">Enrollment No: {selectedStudentGradebook.enrollment_number}</p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={exportStudentPDF}
                  className="px-6 py-3 bg-[#5A5A40] text-white rounded-xl font-bold text-sm shadow-lg hover:bg-[#4A4A30] transition-all flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Save to PDF
                </button>
                <button 
                  onClick={() => setSelectedStudentGradebook(null)}
                  className="px-6 py-3 bg-gray-200 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-300 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-8">
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-8 h-8 text-[#5A5A40] animate-spin" />
                </div>
              ) : studentGradesData.length === 0 ? (
                <div className="text-center py-10 text-gray-500 font-medium">No records found.</div>
              ) : (
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-gray-50/50">
                      <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Subject</th>
                      <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Sem</th>
                      <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">MST1</th>
                      <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">MST2</th>
                      <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">MST3</th>
                      <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center bg-gray-100">Best MST</th>
                      <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">QAR</th>
                      <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">LQAR</th>
                      <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Assign</th>
                      <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Disc</th>
                      <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Lab Int.</th>
                      <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Lab Disc.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {studentGradesData.map((g) => (
                      <tr key={g.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 border-r border-gray-100">
                          {g.classes?.subjects?.subject_name}
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">{g.classes?.subjects?.subject_code}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-center text-gray-500">{g.classes?.semester}</td>
                        <td className="px-4 py-3 text-sm text-center text-gray-500">{g.mst_1 || 0}</td>
                        <td className="px-4 py-3 text-sm text-center text-gray-500">{g.mst_2 || 0}</td>
                        <td className="px-4 py-3 text-sm text-center text-gray-500">{g.mst_3 || 0}</td>
                        <td className="px-4 py-3 text-sm text-center font-bold text-gray-700 bg-gray-50">
                          {calculateBestMST(g.mst_1, g.mst_2, g.mst_3)}
                        </td>
                        <td className="px-4 py-3 text-sm text-center text-gray-500">{g.qar || 0}</td>
                        <td className="px-4 py-3 text-sm text-center text-gray-500">{g.lqar || 0}</td>
                        <td className="px-4 py-3 text-sm text-center text-gray-500">{g.assignment_marks || 0}</td>
                        <td className="px-4 py-3 text-sm text-center text-gray-500">{g.qar_discipline || 0}</td>
                        <td className="px-4 py-3 text-sm text-center text-gray-500">{g.lab_internal || 0}</td>
                        <td className="px-4 py-3 text-sm text-center text-gray-500">{g.lab_discipline || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- HELPER COMPONENTS ---

const Input = ({ label, type = 'text', value, onChange, icon: Icon, placeholder }: any) => (
  <div>
    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">{label}</label>
    <div className="relative">
      {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />}
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all text-sm",
          Icon ? "pl-11" : "pl-4"
        )}
        placeholder={placeholder}
      />
    </div>
  </div>
);

const Select = ({ label, value, onChange, options }: any) => (
  <div>
    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">{label}</label>
    <select
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all text-sm"
    >
      <option value="">Select {label}...</option>
      {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Button = ({ loading, label }: any) => (
  <button
    type="submit"
    disabled={loading}
    className="w-full py-4 bg-[#5A5A40] text-white rounded-xl font-bold shadow-lg hover:bg-[#4A4A30] transition-all flex items-center justify-center gap-2 disabled:opacity-70"
  >
    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : label}
  </button>
);

const DataTable = ({ title, headers, data }: any) => (
  <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden h-full">
    <div className="p-8 border-b border-gray-50 flex justify-between items-center">
      <h2 className="text-xl font-serif">{title}</h2>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-gray-50/50">
            {headers.map((h: string) => (
              <th key={h} className="px-8 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-8 py-12 text-center text-gray-400 italic text-sm">No records found.</td>
            </tr>
          ) : (
            data.map((row: any, i: number) => (
              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                {row.map((cell: any, j: number) => (
                  <td key={j} className="px-8 py-5 text-sm text-gray-600">{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const SemesterSelector = ({ selected, onSelect }: any) => (
  <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
    {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
      <button
        key={sem}
        onClick={() => onSelect(sem)}
        className={cn(
          "flex-1 min-w-[100px] py-3 rounded-xl text-xs font-bold transition-all",
          selected === sem ? "bg-[#5A5A40] text-white shadow-md" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
        )}
      >
        Semester {sem}
      </button>
    ))}
  </div>
);
