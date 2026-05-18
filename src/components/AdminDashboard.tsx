import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, GraduationCap, Mail, Lock, Hash, 
  Search, Loader2, CheckCircle2, AlertCircle, LogOut, Filter, Calendar
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

interface AdminDashboardProps {
  user: any;
  department: string;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, department, onLogout }) => {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Data
  const [students, setStudents] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');

  // Form
  const [studentForm, setStudentForm] = useState({
    name: '',
    email: '',
    password: '',
    enrollmentNumber: '',
    phoneNumber: '',
    batchId: '',
    newBatchYear: ''
  });

  useEffect(() => {
    fetchBatches();
    fetchStudents();
  }, [department]);

  const fetchBatches = async () => {
    const { data } = await supabase.from('batches').select('*').eq('department_name', department);
    setBatches(data || []);
  };

  const fetchStudents = async (batchId?: string) => {
    setFetching(true);
    let query = supabase.from('students').select('*, batches(admission_year)').eq('department_name', department);
    if (batchId) query = query.eq('batch_id', batchId);
    
    const { data } = await query.order('name');
    setStudents(data || []);
    setFetching(false);
  };

  const handleOnboardStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!/^\d{4}[A-Za-z]{2}\d{5,6}$/.test(studentForm.enrollmentNumber)) {
        throw new Error("Invalid Enrollment Number format. It must be 11 or 12 characters, e.g., '0701CS231009'.");
      }

      let finalBatchId = studentForm.batchId;

      // If "new" batch is selected, create it first
      if (finalBatchId === 'new') {
        if (!studentForm.newBatchYear) throw new Error("Please enter the admission year for the new batch.");
        
        const { data: newBatch, error: batchError } = await supabase
          .from('batches')
          .insert({
            admission_year: parseInt(studentForm.newBatchYear),
            department_name: department
          })
          .select()
          .single();

        if (batchError) throw batchError;
        finalBatchId = newBatch.id;
        fetchBatches(); // Refresh batches list
      }

      if (!finalBatchId) throw new Error("Please select or create a batch.");

      const res = await fetch('/api/provision-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...studentForm, 
          batchId: finalBatchId,
          departmentName: department 
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setStudentForm({ 
          name: '', 
          email: '', 
          password: '', 
          enrollmentNumber: '', 
          phoneNumber: '', 
          batchId: '',
          newBatchYear: ''
        });
        fetchStudents(selectedBatchId);
      } else throw new Error(data.message);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex">
      {/* Sidebar */}
      <aside className="w-72 bg-[#1A1A1A] text-white flex flex-col shadow-2xl sticky top-0 h-screen">
        <div className="p-8 border-b border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#5A5A40] rounded-xl flex items-center justify-center shadow-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="font-serif text-xl tracking-tight">Admin Portal</span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">{department}</p>
        </div>

        <nav className="flex-1 p-6 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 text-white shadow-sm text-sm font-medium">
            <Users className="w-5 h-5 text-[#5A5A40]" />
            Student Onboarding
          </button>
        </nav>

        <div className="p-6 border-t border-white/10">
          <div className="flex items-center gap-3 px-4 py-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold uppercase text-white">
              {(user.profile?.name || user.email)[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate text-white">{user.profile?.name || 'Administrator'}</p>
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
          <header className="mb-12 flex justify-between items-end">
            <div>
              <h1 className="text-4xl font-serif text-[#1A1A1A] mb-2">Student Management</h1>
              <p className="text-gray-500 italic">Onboard and manage students for the {department} department.</p>
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-1">
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 sticky top-12">
                <h2 className="text-xl font-serif mb-6 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[#5A5A40]" />
                  Onboard Student
                </h2>
                <form onSubmit={handleOnboardStudent} className="space-y-5">
                  <Input label="Full Name" value={studentForm.name} onChange={v => setStudentForm({...studentForm, name: v})} icon={Users} placeholder="Jane Doe" />
                  <Input label="Enrollment No" value={studentForm.enrollmentNumber} onChange={v => setStudentForm({...studentForm, enrollmentNumber: v})} icon={Hash} placeholder="e.g. 0701CS231009" />
                  <Input label="Official Email" type="email" value={studentForm.email} onChange={v => setStudentForm({...studentForm, email: v})} icon={Mail} placeholder="student@uecu.ac.in" />
                  <Input label="Password" type="password" value={studentForm.password} onChange={v => setStudentForm({...studentForm, password: v})} icon={Lock} placeholder="••••••••" />
                  <Input label="Mobile Number" value={studentForm.phoneNumber} onChange={v => setStudentForm({...studentForm, phoneNumber: v})} icon={Hash} placeholder="+91 9876543210" />
                  <Select 
                    label="Target Batch" 
                    value={studentForm.batchId} 
                    onChange={v => setStudentForm({...studentForm, batchId: v})}
                    options={[
                      ...batches.map(b => ({ value: b.id, label: `${b.admission_year} Batch` })),
                      { value: 'new', label: '+ Add New Batch...' }
                    ]}
                  />
                  {studentForm.batchId === 'new' && (
                    <Input 
                      label="New Batch Admission Year" 
                      type="number"
                      value={studentForm.newBatchYear} 
                      onChange={v => setStudentForm({...studentForm, newBatchYear: v})} 
                      icon={Calendar} 
                      placeholder="e.g. 2027" 
                    />
                  )}
                  <Button loading={loading} label="Onboard Student" />
                </form>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                <Filter className="w-5 h-5 text-gray-400" />
                <select 
                  value={selectedBatchId}
                  onChange={(e) => {
                    setSelectedBatchId(e.target.value);
                    fetchStudents(e.target.value);
                  }}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium"
                >
                  <option value="">All Batches</option>
                  {batches.map(b => <option key={b.id} value={b.id}>{b.admission_year} Batch</option>)}
                </select>
              </div>

              <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50">
                      <th className="px-8 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Name</th>
                      <th className="px-8 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Enrollment</th>
                      <th className="px-8 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Batch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {fetching ? (
                      <tr><td colSpan={3} className="px-8 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" /></td></tr>
                    ) : students.length === 0 ? (
                      <tr><td colSpan={3} className="px-8 py-12 text-center text-gray-400 italic">No students found.</td></tr>
                    ) : (
                      students.map(s => (
                        <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-8 py-5 text-sm font-medium text-gray-900">{s.name}</td>
                          <td className="px-8 py-5 text-sm text-gray-500 font-mono">{s.enrollment_number}</td>
                          <td className="px-8 py-5 text-sm text-gray-500">{s.batches?.admission_year}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

const Input = ({ label, type = 'text', value, onChange, icon: Icon, placeholder }: any) => (
  <div>
    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">{label}</label>
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

const Select = ({ label, value, onChange, options }: any) => (
  <div>
    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">{label}</label>
    <select required value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all text-sm">
      <option value="">Select {label}...</option>
      {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Button = ({ loading, label }: any) => (
  <button type="submit" disabled={loading} className="w-full py-4 bg-[#5A5A40] text-white rounded-xl font-bold shadow-lg hover:bg-[#4A4A30] transition-all flex items-center justify-center gap-2 disabled:opacity-70">
    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : label}
  </button>
);
