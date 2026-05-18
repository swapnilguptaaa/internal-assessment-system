import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, GraduationCap, Mail, Lock, Hash, 
  Search, Loader2, CheckCircle2, AlertCircle, LogOut, Filter,
  Layout, BookOpen, Bell, Save, Plus, Trash2, Calendar, Download
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn, formatStudentName } from '../lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FacultyDashboardProps {
  user: any;
  department: string;
  onLogout: () => void;
}

export const FacultyDashboard: React.FC<FacultyDashboardProps> = ({ user, department, onLogout }) => {
  const [activeClass, setActiveClass] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'students' | 'notices' | 'gradebook'>('students');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Data
  const [classes, setClasses] = useState<any[]>([]);
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [searchEnrollment, setSearchEnrollment] = useState('');
  const [attendancePeriod, setAttendancePeriod] = useState({ from: '', to: '', totalTheoryClasses: 0, totalLabSessions: 0 });

  // Form
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '' });

  useEffect(() => {
    fetchClasses();
  }, [user.id]);

  useEffect(() => {
    if (activeClass) {
      fetchEnrolledStudents();
      fetchNotices();
      fetchGrades();
      setAttendancePeriod(prev => ({
        ...prev,
        totalTheoryClasses: activeClass.total_theory_classes || 0,
        totalLabSessions: activeClass.total_lab_sessions || 0,
        from: activeClass.attendance_from || '',
        to: activeClass.attendance_to || ''
      }));
    }
  }, [activeClass]);

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('*, subjects(subject_name, subject_code), faculties(name)')
      .eq('faculty_id', user.id);
    setClasses(data || []);
  };

  const fetchEnrolledStudents = async () => {
    const { data } = await supabase
      .from('class_enrollments')
      .select('*, students(name, enrollment_number)')
      .eq('class_id', activeClass.id);
    setEnrolledStudents(data || []);
  };

  const fetchNotices = async () => {
    const { data } = await supabase
      .from('class_notices')
      .select('*')
      .eq('class_id', activeClass.id)
      .order('created_at', { ascending: false });
    setNotices(data || []);
  };

  const fetchGrades = async () => {
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
        students: enr.students // Ensure student details are always present for display
      };
    });

    setGrades(mergedGrades);
  };

  const handleAcceptClass = async (classId: string) => {
    const { error } = await supabase
      .from('classes')
      .update({ faculty_status: 'accepted' })
      .eq('id', classId);
    if (!error) fetchClasses();
  };

  const handleAddStudentDirectly = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!/^\d{4}[A-Za-z]{2}\d{5,6}$/.test(searchEnrollment)) {
        throw new Error("Invalid Enrollment Number format. It must be 11 or 12 characters, e.g., '0701CS231009'.");
      }

      // We no longer require the student to exist on the client side,
      // as the server endpoint can handle unprovisioned students.
      const response = await fetch('/api/enroll-student', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          classId: activeClass.id,
          enrollmentNumber: searchEnrollment,
          departmentName: department
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.message || 'Failed to enroll student');
      }
      
      setMessage({ type: 'success', text: 'Student added directly to the class.' });
      setSearchEnrollment('');
      fetchEnrolledStudents();
      fetchGrades();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePostNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase
        .from('class_notices')
        .insert({
          class_id: activeClass.id,
          title: noticeForm.title,
          content: noticeForm.content,
          created_by: user.id,
          department_name: department
        });
      if (error) throw error;
      setNoticeForm({ title: '', content: '' });
      fetchNotices();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
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

  const handleUpdateGrades = async () => {
    setLoading(true);
    try {
      const updates = grades.map(g => {
        const row: any = {
          class_id: activeClass.id,
          student_id: g.student_id,
          mst_1: Number(g.mst_1) || 0,
          mst_2: Number(g.mst_2) || 0,
          qar: calculateQAR(g.attendance_class, attendancePeriod.totalTheoryClasses, g.assignment_marks, g.qar_discipline),
          lqar: calculateLQAR(g.attendance_lab, attendancePeriod.totalLabSessions, g.lab_internal, g.lab_discipline),
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

      const response = await fetch('/api/update-grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates,
          activeClassId: activeClass.id,
          attendancePeriod
        })
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.message);

      setMessage({ type: 'success', text: 'Grades updated successfully' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const updateGradeField = (studentId: string, field: string, value: any) => {
    setGrades(prev => prev.map(g => {
      if (g.student_id === studentId) return { ...g, [field]: value };
      return g;
    }));
  };

  const exportToPDF = async () => {
    if (!activeClass) return;

    // Use portrait mode
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF({ orientation: 'portrait' });

    let currentY = 15;
    let headerImg: HTMLImageElement | null = null;
    let imgWidth = 0;
    let imgHeight = 0;

    try {
      // Try to load the header image from the public folder
      headerImg = new Image();
      headerImg.src = '/uec-header.png'; // Make sure to save the uploaded image as public/uec-header.png
      await new Promise((resolve, reject) => {
        if (!headerImg) return reject();
        headerImg.onload = resolve;
        headerImg.onerror = reject;
      });
      
      imgWidth = 190; // Fit to portrait width
      imgHeight = (headerImg.height * imgWidth) / headerImg.width;
      doc.addImage(headerImg, 'PNG', 10, 10, imgWidth, imgHeight);
      currentY = 10 + imgHeight + 10;
    } catch (error) {
      // Fallback if image not found
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Ujjain Engineering College, Ujjain', doc.internal.pageSize.width / 2, currentY, { align: 'center' });
      currentY += 15;
    }

    // Sub-header
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Subject: ${activeClass.subjects?.subject_name} (${activeClass.subjects?.subject_code})`, 8, currentY);
    doc.text(`Faculty: ${activeClass.faculties?.name || user.profile?.name || user.email || 'Assigned Faculty'}`, 8, currentY + 7);

    // Legend at Top Right
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(7);
    doc.setTextColor(100);
    doc.text("M1/M2/M3: Mid Sem Tests | B.M: Best MST | Asg: Assignment", pageWidth - 5, currentY, { align: 'right' });
    doc.text("QD: QAR Discipline | AC: Attend Class | QAR: Quiz & Assign. Record", pageWidth - 5, currentY + 4, { align: 'right' });
    doc.text("AL: Attend Lab | LI: Lab Internal | LD: Lab Discip. | LQR: Lab QAR", pageWidth - 5, currentY + 8, { align: 'right' });
    doc.setTextColor(0);

    currentY += 15;

    // Table Data
    const tableData = grades.map((g, index) => {
      const bestMst = calculateBestMST(g.mst_1, g.mst_2, g.mst_3);
      const qar = calculateQAR(g.attendance_class, attendancePeriod.totalTheoryClasses, g.assignment_marks, g.qar_discipline);
      const lqar = calculateLQAR(g.attendance_lab, attendancePeriod.totalLabSessions, g.lab_internal, g.lab_discipline);

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
        qar,
        g.attendance_lab || 0,
        g.lab_internal || 0,
        g.lab_discipline || 0,
        lqar
      ];
    });

    autoTable(doc, {
      startY: currentY,
      margin: { top: 15, right: 5, bottom: 20, left: 5 },
      styles: { fontSize: 10, cellPadding: 0.8 },
      head: [[
        '#', 
        'Name', 
        'Enroll No.', 
        'M1', 
        'M2', 
        'M3', 
        'B.M', 
        'Asg', 
        'QD', 
        'AC', 
        'QAR', 
        'AL',
        'LI',
        'LD',
        'LQR'
      ]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [90, 90, 64], halign: 'center', fontSize: 9 }, // #5A5A40
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { cellWidth: 22, halign: 'left' },
        2: { cellWidth: 32, halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'center' },
        7: { halign: 'center' },
        8: { halign: 'center' },
        9: { halign: 'center' },
        10: { halign: 'center' },
        11: { halign: 'center' },
        12: { halign: 'center' },
        13: { halign: 'center' },
        14: { halign: 'center' },
      },
      didDrawPage: function (data) {
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
      doc.addImage(headerImg, 'PNG', 10, 10, imgWidth, imgHeight);
      y = 10 + imgHeight + 10;
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Evaluation Formulas & Criteria', 10, y);
    y += 15;

    doc.setFontSize(12);
    doc.setFont('times', 'italic'); // Requested italic
    
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

    doc.save(`${activeClass.subjects?.subject_code}_Grades.pdf`);
  };

  if (activeClass) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
        <header className="bg-[#1A1A1A] text-white p-6 shadow-xl">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button onClick={() => setActiveClass(null)} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                <Layout className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-serif">{activeClass.subjects?.subject_name}</h1>
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{activeClass.subjects?.subject_code} • Semester {activeClass.semester}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="hidden md:flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-bold text-white">{user.profile?.name || 'Faculty Member'}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest">{user.email}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#5A5A40] flex items-center justify-center text-sm font-bold uppercase text-white shadow-lg">
                  {(user.profile?.name || user.email)[0]}
                </div>
              </div>
              <div className="flex bg-white/5 p-1 rounded-xl">
                {[
                  { id: 'students', label: 'Students', icon: Users },
                  { id: 'notices', label: 'Notices', icon: Bell },
                  { id: 'gradebook', label: 'Gradebook', icon: BookOpen },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id as any)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                      activeTab === t.id ? "bg-[#5A5A40] text-white shadow-lg" : "text-gray-400 hover:text-white"
                    )}
                  >
                    <t.icon className="w-4 h-4" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-12 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {message && (
              <div className={cn(
                "mb-8 flex items-center gap-2 text-sm p-4 rounded-xl animate-in fade-in slide-in-from-top-2",
                message.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              )}>
                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                {message.text}
              </div>
            )}

            {/* TAB: STUDENTS */}
            {activeTab === 'students' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-1">
                  <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
                    <h2 className="text-xl font-serif mb-6 flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-[#5A5A40]" />
                      Add Student
                    </h2>
                    <form onSubmit={handleAddStudentDirectly} className="space-y-5">
                      <Input 
                        label="Enrollment Number" 
                        value={searchEnrollment} 
                        onChange={setSearchEnrollment} 
                        icon={Hash} 
                        placeholder="e.g. 0701CS231009" 
                      />
                      <Button loading={loading} label="Add Student Directly" />
                    </form>
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50/50">
                          <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Name</th>
                          <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Enrollment</th>
                          <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {enrolledStudents.map(es => (
                          <tr key={es.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-8 py-5 text-sm font-medium text-gray-900">{formatStudentName(es.students?.name)}</td>
                            <td className="px-8 py-5 text-sm text-gray-500 font-mono">{es.students?.enrollment_number}</td>
                            <td className="px-8 py-5 text-sm">
                              <span className={cn(
                                "px-2 py-1 rounded text-[10px] font-bold uppercase",
                                es.status === 'pending' ? "bg-yellow-50 text-yellow-600" : "bg-green-50 text-green-600"
                              )}>{es.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: NOTICES */}
            {activeTab === 'notices' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-1">
                  <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
                    <h2 className="text-xl font-serif mb-6 flex items-center gap-2">
                      <Bell className="w-5 h-5 text-[#5A5A40]" />
                      Post Announcement
                    </h2>
                    <form onSubmit={handlePostNotice} className="space-y-5">
                      <Input label="Title" value={noticeForm.title} onChange={v => setNoticeForm({...noticeForm, title: v})} placeholder="MST-1 Schedule" />
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 ml-1">Content</label>
                        <textarea
                          required value={noticeForm.content} onChange={(e) => setNoticeForm({...noticeForm, content: e.target.value})}
                          rows={4} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all text-sm"
                          placeholder="Write your announcement here..."
                        />
                      </div>
                      <Button loading={loading} label="Publish Notice" />
                    </form>
                  </div>
                </div>
                <div className="lg:col-span-2 space-y-6">
                  {notices.map(n => (
                    <div key={n.id} className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-serif">{n.title}</h3>
                        <span className="text-[10px] text-gray-400 font-bold uppercase">{new Date(n.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-gray-600 text-sm leading-relaxed">{n.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: GRADEBOOK */}
            {activeTab === 'gradebook' && (
              <div className="space-y-8">
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-wrap gap-6 justify-between items-center">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-gray-50 rounded-xl">
                        <Calendar className="w-5 h-5 text-gray-400" />
                      </div>
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
                    </div>

                    <div className="flex items-center gap-4 border-l border-gray-100 pl-6">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-gray-400">Total Theory Classes</p>
                        <input 
                          type="number" 
                          min="0"
                          value={attendancePeriod.totalTheoryClasses} 
                          onChange={(e) => setAttendancePeriod(prev => ({ ...prev, totalTheoryClasses: parseInt(e.target.value) || 0 }))}
                          className="w-16 mt-1 text-xs bg-gray-50 border-none rounded p-1 focus:ring-1 focus:ring-[#5A5A40] text-center font-bold"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-gray-400">Total Lab Sessions</p>
                        <input 
                          type="number" 
                          min="0"
                          value={attendancePeriod.totalLabSessions} 
                          onChange={(e) => setAttendancePeriod(prev => ({ ...prev, totalLabSessions: parseInt(e.target.value) || 0 }))}
                          className="w-16 mt-1 text-xs bg-gray-50 border-none rounded p-1 focus:ring-1 focus:ring-[#5A5A40] text-center font-bold"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={exportToPDF}
                      className="flex items-center gap-2 px-6 py-3 bg-white text-[#5A5A40] border border-[#5A5A40] rounded-xl font-bold shadow-sm hover:bg-gray-50 transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Export PDF
                    </button>
                    <button 
                      onClick={handleUpdateGrades}
                      disabled={loading}
                      className="flex items-center gap-2 px-6 py-3 bg-[#5A5A40] text-white rounded-xl font-bold shadow-lg hover:bg-[#4A4A30] transition-all disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Update Grades
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1200px]">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 sticky left-0 bg-gray-50 z-10 border-r border-gray-100">Student</th>
                        <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">MST 1<br/><span className="text-[10px] font-medium text-gray-400">(Max 20)</span></th>
                        <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">MST 2<br/><span className="text-[10px] font-medium text-gray-400">(Max 20)</span></th>
                        <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">MST 3<br/><span className="text-[10px] font-medium text-gray-400">(Max 20)</span></th>
                        <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center bg-gray-100">Best MST</th>
                        <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">
                          Theory Att.
                          <br />
                          <span className="text-[10px] font-medium text-gray-400 opacity-70">
                            {attendancePeriod.from && attendancePeriod.to ? `${attendancePeriod.from} to ${attendancePeriod.to}` : '(Select Dates)'}
                          </span>
                        </th>
                        <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Assign.<br/><span className="text-[10px] font-medium text-gray-400">(Max 2)</span></th>
                        <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Discip.<br/><span className="text-[10px] font-medium text-gray-400">(Max 1)</span></th>
                        <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center bg-gray-100">QAR Total</th>
                        <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">
                          Lab Att.
                          <br />
                          <span className="text-[10px] font-medium text-gray-400 opacity-70">
                            {attendancePeriod.from && attendancePeriod.to ? `${attendancePeriod.from} to ${attendancePeriod.to}` : '(Select Dates)'}
                          </span>
                        </th>
                        <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Lab Int.<br/><span className="text-[10px] font-medium text-gray-400">(Max 8)</span></th>
                        <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Lab Disc.<br/><span className="text-[10px] font-medium text-gray-400">(Max 2)</span></th>
                        <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center bg-gray-100">LQAR Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {grades.map(g => (
                        <tr key={g.student_id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 sticky left-0 bg-white z-10 border-r border-gray-100">
                            <p className="text-sm font-medium text-gray-900">{formatStudentName(g.students?.name)}</p>
                            <p className="text-[10px] font-mono text-gray-400">{g.students?.enrollment_number}</p>
                          </td>
                          <GradeInput value={g.mst_1} onChange={v => updateGradeField(g.student_id, 'mst_1', Math.max(0, Math.min(Number(v), 20)))} />
                          <GradeInput value={g.mst_2} onChange={v => updateGradeField(g.student_id, 'mst_2', Math.max(0, Math.min(Number(v), 20)))} />
                          <GradeInput value={g.mst_3} onChange={v => updateGradeField(g.student_id, 'mst_3', Math.max(0, Math.min(Number(v), 20)))} />
                          <td className="px-4 py-4 text-center bg-gray-50 font-bold text-gray-700">
                            {calculateBestMST(g.mst_1, g.mst_2, g.mst_3)}
                          </td>
                          <AttendanceInput 
                            value={g.attendance_class} 
                            total={attendancePeriod.totalTheoryClasses} 
                            onChange={v => updateGradeField(g.student_id, 'attendance_class', Math.max(0, v))} 
                          />
                          <GradeInput value={g.assignment_marks} onChange={v => updateGradeField(g.student_id, 'assignment_marks', Math.max(0, Math.min(Number(v), 2)))} />
                          <GradeInput value={g.qar_discipline} onChange={v => updateGradeField(g.student_id, 'qar_discipline', Math.max(0, Math.min(Number(v), 1)))} />
                          <td className="px-4 py-4 text-center bg-gray-50 font-bold text-[#5A5A40]">
                            {calculateQAR(g.attendance_class, attendancePeriod.totalTheoryClasses, g.assignment_marks, g.qar_discipline)}
                          </td>
                          <AttendanceInput 
                            value={g.attendance_lab} 
                            total={attendancePeriod.totalLabSessions} 
                            onChange={v => updateGradeField(g.student_id, 'attendance_lab', Math.max(0, v))} 
                          />
                          <GradeInput value={g.lab_internal} onChange={v => updateGradeField(g.student_id, 'lab_internal', Math.max(0, Math.min(Number(v), 8)))} />
                          <GradeInput value={g.lab_discipline} onChange={v => updateGradeField(g.student_id, 'lab_discipline', Math.max(0, Math.min(Number(v), 2)))} />
                          <td className="px-4 py-4 text-center bg-gray-50 font-bold text-[#5A5A40]">
                            {calculateLQAR(g.attendance_lab, attendancePeriod.totalLabSessions, g.lab_internal, g.lab_discipline)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex">
      {/* Sidebar */}
      <aside className="w-72 bg-[#1A1A1A] text-white flex flex-col shadow-2xl sticky top-0 h-screen">
        <div className="p-8 border-b border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#5A5A40] rounded-xl flex items-center justify-center shadow-lg">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <span className="font-serif text-xl tracking-tight">Faculty Portal</span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">{department}</p>
        </div>

        <nav className="flex-1 p-6 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 text-white shadow-sm text-sm font-medium">
            <Layout className="w-5 h-5 text-[#5A5A40]" />
            My Classrooms
          </button>
        </nav>

        <div className="p-6 border-t border-white/10">
          <div className="flex items-center gap-3 px-4 py-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold uppercase text-white">
              {(user.profile?.name || user.email)[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate text-white">{user.profile?.name || 'Faculty Member'}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider truncate">{user.email}</p>
            </div>
          </div>
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all text-sm font-medium">
            <LogOut className="w-5 h-5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-12 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <header className="mb-12">
            <h1 className="text-4xl font-serif text-[#1A1A1A] mb-2">My Classrooms</h1>
            <p className="text-gray-500 italic">Manage your assigned classes and evaluate student performance.</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {classes.map(c => (
              <div key={c.id} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center group-hover:bg-[#5A5A40]/5 transition-colors">
                    <BookOpen className="w-6 h-6 text-gray-400 group-hover:text-[#5A5A40]" />
                  </div>
                  {c.faculty_status === 'pending' ? (
                    <button 
                      onClick={() => handleAcceptClass(c.id)}
                      className="px-4 py-2 bg-green-50 text-green-600 text-[10px] font-bold uppercase rounded-lg hover:bg-green-100 transition-all"
                    >
                      Accept Class
                    </button>
                  ) : (
                    <span className="px-3 py-1 bg-[#5A5A40]/5 text-[#5A5A40] text-[10px] font-bold uppercase rounded-lg">Active</span>
                  )}
                </div>
                <h3 className="text-xl font-serif mb-2">{c.subjects?.subject_name}</h3>
                <p className="text-xs text-gray-400 font-mono mb-6">{c.subjects?.subject_code} • Sem {c.semester}</p>
                <button 
                  onClick={() => setActiveClass(c)}
                  disabled={c.faculty_status === 'pending'}
                  className="w-full py-3 bg-gray-50 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-100 transition-all disabled:opacity-50"
                >
                  Manage Classroom
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

const GradeInput = ({ value, onChange }: any) => (
  <td className="px-4 py-4">
    <input
      type="number" value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))}
      className="w-16 mx-auto block text-center bg-gray-50 border-none rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#5A5A40] transition-all"
    />
  </td>
);

const AttendanceInput = ({ value, total, onChange }: any) => (
  <td className="px-4 py-4">
    <div className="flex flex-col items-center gap-1">
      <select 
        value={value ?? ''} 
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 text-center bg-gray-50 border-none rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#5A5A40] transition-all"
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

const Input = ({ label, type = 'text', value, onChange, icon: Icon, placeholder }: any) => (
  <div>
    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 ml-1">{label}</label>
    <div className="relative">
      {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />}
      <input
        type={type} required value={value} onChange={(e) => onChange(e.target.value)}
        className={cn("w-full pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all text-sm", Icon ? "pl-11" : "pl-4")}
        placeholder={placeholder}
      />
    </div>
  </div>
);

const Button = ({ loading, label }: any) => (
  <button type="submit" disabled={loading} className="w-full py-4 bg-[#5A5A40] text-white rounded-xl font-bold shadow-lg hover:bg-[#4A4A30] transition-all flex items-center justify-center gap-2 disabled:opacity-70">
    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : label}
  </button>
);
