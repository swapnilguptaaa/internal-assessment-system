import React, { useState, useEffect } from 'react';
import { 
  Users, GraduationCap, BookOpen, Bell, Layout, 
  CheckCircle2, AlertCircle, LogOut, Loader2, ChevronRight,
  FileText, BarChart3
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

interface StudentDashboardProps {
  user: any;
  department: string;
  onLogout: () => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ user, department, onLogout }) => {
  const [activeClass, setActiveClass] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Data
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [myClasses, setMyClasses] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [myGrades, setMyGrades] = useState<any | null>(null);

  useEffect(() => {
    fetchEnrollments();
  }, [user.id]);

  useEffect(() => {
    if (activeClass) {
      fetchNotices();
      fetchMyGrades();
    }
  }, [activeClass]);

  const fetchEnrollments = async () => {
    setFetching(true);
    const { data, error } = await supabase
      .from('class_enrollments')
      .select('*, classes(*, subjects(subject_name, subject_code), faculties(name))')
      .eq('student_id', user.id);
    
    if (!error) {
      setPendingRequests(data.filter(e => e.status === 'pending'));
      setMyClasses(data.filter(e => e.status === 'accepted'));
    }
    setFetching(false);
  };

  const fetchNotices = async () => {
    const { data } = await supabase
      .from('class_notices')
      .select('*')
      .eq('class_id', activeClass.class_id)
      .order('created_at', { ascending: false });
    setNotices(data || []);
  };

  const fetchMyGrades = async () => {
    const { data } = await supabase
      .from('grades')
      .select('*')
      .eq('class_id', activeClass.class_id)
      .eq('student_id', user.id)
      .single();
    setMyGrades(data);
  };

  const handleAcceptRequest = async (enrollmentId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('class_enrollments')
        .update({ status: 'accepted' })
        .eq('id', enrollmentId);
      
      if (error) throw error;
      await fetchEnrollments();
    } catch (err: any) {
      console.error('Error accepting request:', err);
      alert(err.message || 'Failed to accept request');
    } finally {
      setLoading(false);
    }
  };

  if (activeClass) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
        <header className="bg-[#1A1A1A] text-white p-6 shadow-xl">
          <div className="max-w-5xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button onClick={() => setActiveClass(null)} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                <Layout className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-serif">{activeClass.classes?.subjects?.subject_name}</h1>
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                  {activeClass.classes?.subjects?.subject_code} • Faculty: {activeClass.classes?.faculties?.name}
                </p>
              </div>
            </div>
            
            {/* Student Profile Top Nav */}
            <div className="hidden md:flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-bold text-white">{user.profile?.name || 'Student'}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest">{user.email}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#5A5A40] flex items-center justify-center text-sm font-bold uppercase text-white shadow-lg">
                {(user.profile?.name || user.email)[0]}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-12 overflow-y-auto">
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Notices Section */}
            <div className="lg:col-span-2 space-y-6">
              <h2 className="text-2xl font-serif flex items-center gap-2">
                <Bell className="w-6 h-6 text-[#5A5A40]" />
                Class Announcements
              </h2>
              {notices.length === 0 ? (
                <div className="bg-white p-12 rounded-[2rem] text-center border border-gray-100 italic text-gray-400">
                  No announcements yet.
                </div>
              ) : (
                notices.map(n => (
                  <div key={n.id} className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-serif">{n.title}</h3>
                      <span className="text-[10px] text-gray-400 font-bold uppercase">{new Date(n.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-gray-600 text-sm leading-relaxed">{n.content}</p>
                  </div>
                ))
              )}
            </div>

            {/* Grades Section */}
            <div className="lg:col-span-1 space-y-6">
              <h2 className="text-2xl font-serif flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-[#5A5A40]" />
                My Performance
              </h2>
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
                {!myGrades ? (
                  <p className="text-center text-gray-400 italic py-8">Grades not yet published.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <GradeCard label="MST 1" value={myGrades.mst_1 || "0"} />
                      <GradeCard label="MST 2" value={myGrades.mst_2 || "0"} />
                      <GradeCard label="MST 3" value={myGrades.mst_3 || "0"} />
                      <GradeCard label="Best MST" value={Math.max(Number(myGrades.mst_1) || 0, Math.max(Number(myGrades.mst_2) || 0, Number(myGrades.mst_3) || 0))} />
                      <GradeCard label="QAR" value={myGrades.qar || "0.00"} />
                    </div>
                    <div className="pt-4 border-t border-gray-50 space-y-3">
                      <StatusRow label="Assignment Marks" status={`${myGrades.assignment_marks || 0} / 2`} />
                      <StatusRow label="QAR Discipline" status={`${myGrades.qar_discipline || 0} / 1`} />
                      <StatusRow label="Lab Internal" status={`${myGrades.lab_internal || 0} / 8`} />
                      <StatusRow label="Lab Discipline" status={`${myGrades.lab_discipline || 0} / 2`} />
                      <StatusRow label="LQAR Total" status={`${myGrades.lqar || "0.00"} / 20`} />
                    </div>
                    <div className="pt-4 border-t border-gray-50 space-y-4">
                      <div className="flex justify-between items-center pb-2">
                        <span className="text-xs font-bold uppercase text-gray-500 tracking-wider">Attendance Period</span>
                        <span className="text-xs font-bold text-gray-700">
                          {activeClass.classes?.attendance_from ? new Date(activeClass.classes.attendance_from).toLocaleDateString() : 'N/A'} - {activeClass.classes?.attendance_to ? new Date(activeClass.classes.attendance_to).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-600">Theory Attendance</span>
                          <div className="text-right">
                            <span className="text-lg font-bold text-gray-900">{myGrades.attendance_class} / {activeClass.classes?.total_theory_classes || 0}</span>
                            <p className="text-xs text-[#5A5A40] font-bold mt-0.5">
                              {activeClass.classes?.total_theory_classes > 0 ? Math.round((myGrades.attendance_class / activeClass.classes.total_theory_classes) * 100) : 0}%
                            </p>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-600">Lab Attendance</span>
                          <div className="text-right">
                            <span className="text-lg font-bold text-gray-900">{myGrades.attendance_lab} / {activeClass.classes?.total_lab_sessions || 0}</span>
                            <p className="text-xs text-[#5A5A40] font-bold mt-0.5">
                              {activeClass.classes?.total_lab_sessions > 0 ? Math.round((myGrades.attendance_lab / activeClass.classes.total_lab_sessions) * 100) : 0}%
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
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
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="font-serif text-xl tracking-tight">Student Portal</span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">{department}</p>
        </div>

        <nav className="flex-1 p-6 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 text-white shadow-sm text-sm font-medium">
            <Layout className="w-5 h-5 text-[#5A5A40]" />
            My Dashboard
          </button>
        </nav>

        <div className="p-6 border-t border-white/10">
          <div className="flex items-center gap-3 px-4 py-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold uppercase text-white">
              {(user.profile?.name || user.email)[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate text-white">{user.profile?.name || 'Student'}</p>
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
        <div className="max-w-5xl mx-auto space-y-12">
          {/* Pending Requests */}
          {pendingRequests.length > 0 && (
            <section>
              <h2 className="text-2xl font-serif text-[#1A1A1A] mb-6 flex items-center gap-2">
                <Bell className="w-6 h-6 text-yellow-500" />
                Pending Class Requests
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pendingRequests.map(req => (
                  <div key={req.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex justify-between items-center">
                    <div>
                      <h3 className="font-serif text-lg">{req.classes?.subjects?.subject_name}</h3>
                      <p className="text-xs text-gray-400">Faculty: {req.classes?.faculties?.name}</p>
                    </div>
                    <button 
                      onClick={() => handleAcceptRequest(req.id)}
                      disabled={loading}
                      className="px-6 py-3 bg-[#5A5A40] text-white rounded-xl font-bold text-xs shadow-lg hover:bg-[#4A4A30] transition-all disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Accept'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* My Classes */}
          <section>
            <h2 className="text-2xl font-serif text-[#1A1A1A] mb-6">My Classes</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {fetching ? (
                <div className="col-span-full py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-200" /></div>
              ) : myClasses.length === 0 ? (
                <div className="col-span-full py-12 text-center bg-white rounded-[2rem] border border-gray-100 italic text-gray-400">
                  You are not enrolled in any classes yet.
                </div>
              ) : (
                myClasses.map(c => (
                  <button 
                    key={c.id} 
                    onClick={() => setActiveClass(c)}
                    className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 hover:shadow-xl transition-all text-left group"
                  >
                    <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#5A5A40]/5 transition-colors">
                      <BookOpen className="w-6 h-6 text-gray-400 group-hover:text-[#5A5A40]" />
                    </div>
                    <h3 className="text-xl font-serif mb-1">{c.classes?.subjects?.subject_name}</h3>
                    <p className="text-xs text-gray-400 font-mono mb-6">{c.classes?.subjects?.subject_code}</p>
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[#5A5A40]">
                      <span>View Details</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

const GradeCard = ({ label, value }: any) => (
  <div className="bg-gray-50 p-5 rounded-2xl text-center">
    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{label}</p>
    <p className="text-3xl font-bold text-gray-900">{value}</p>
  </div>
);

const StatusRow = ({ label, status }: any) => (
  <div className="flex justify-between items-center py-1">
    <span className="text-sm font-medium text-gray-600">{label}</span>
    <span className="text-sm font-bold text-gray-900">{status}</span>
  </div>
);
