import React, { useState, useEffect } from 'react';
import { ShieldCheck, Loader2, Building2, Users, GraduationCap, Lock, Mail, AlertCircle, Eye, EyeOff, LogOut, Database } from 'lucide-react';
import { supabase } from './lib/supabase';
import { cn } from './lib/utils';

import { ControllerDashboard } from './components/ControllerDashboard';
import { HODDashboard } from './components/HODDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { FacultyDashboard } from './components/FacultyDashboard';
import { StudentDashboard } from './components/StudentDashboard';

// --- STUB DASHBOARDS ---

// --- LOGIN VIEW ---
const LoginView = ({ onLogin }: { onLogin: (role: string, user: any, dept: string | null) => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('controller');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const roles = [
    { id: 'controller', label: 'Controller', icon: ShieldCheck },
    { id: 'hod', label: 'HOD', icon: Building2 },
    { id: 'admin', label: 'Admin', icon: Database },
    { id: 'faculty', label: 'Faculty', icon: Users },
    { id: 'student', label: 'Student', icon: GraduationCap },
  ];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPass = password.trim();

      // 1. Controller Check (Hardcoded for reliability)
      if (role === 'controller') {
        const targetEmailMatches = cleanEmail === '0701cs231009@uecu.ac.in' || cleanEmail === 'tiwariamol2311@gmail.com' || cleanEmail === 'admin@uecu.ac.in';
        const targetPassMatches = cleanPass === 'amol' || cleanPass === 'admin';

        if (targetEmailMatches && targetPassMatches) {
          onLogin('controller', { email: cleanEmail, id: 'controller-static' }, null);
          return;
        } else {
          throw new Error("Invalid Controller credentials");
        }
      }

      // 2. Supabase Auth Check for other roles
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPass,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Authentication failed");

      // 3. Role Verification based on selection
      if (role === 'hod') {
        const { data: hod } = await supabase.from('hod_profiles').select('*').eq('email_id', cleanEmail).maybeSingle();
        if (hod) return onLogin('hod', { ...authData.user, profile: hod }, hod.department_name);
      } else if (role === 'admin') {
        const { data: admin } = await supabase.from('department_admins').select('*').eq('email_id', cleanEmail).maybeSingle();
        if (admin) return onLogin('admin', { ...authData.user, profile: admin }, admin.department_name);
      } else if (role === 'faculty') {
        const { data: faculty } = await supabase.from('faculties').select('*').eq('email_id', cleanEmail).maybeSingle();
        if (faculty) return onLogin('faculty', { ...authData.user, profile: faculty }, faculty.department_name);
      } else if (role === 'student') {
        const { data: student } = await supabase.from('students').select('*').eq('email_id', cleanEmail).maybeSingle();
        if (student) return onLogin('student', { ...authData.user, profile: student }, student.department_name);
      }

      throw new Error(`Account not found as ${role.toUpperCase()}. Please check your role selection or contact administrator.`);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100 p-8 md:p-10">
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 bg-[#5A5A40] rounded-3xl flex items-center justify-center shadow-xl transform -rotate-6">
            <ShieldCheck className="text-white w-10 h-10" />
          </div>
        </div>
        
        <h2 className="text-3xl font-serif text-center text-[#1A1A1A] mb-2">UECU IAE SYSTEM</h2>
        <p className="text-center text-gray-500 mb-8 italic">Internal Assessment Evaluation</p>

        {/* Role Selection Tabs */}
        <div className="flex bg-gray-100 p-1 rounded-2xl mb-8">
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex flex-col items-center gap-1",
                role === r.id ? "bg-white text-[#5A5A40] shadow-sm" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <r.icon className="w-4 h-4" />
              {r.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all"
                placeholder="name@uecu.ac.in"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-500 text-sm justify-center bg-red-50 py-3 rounded-xl px-4 text-center">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-[#5A5A40] text-white rounded-2xl font-bold shadow-lg hover:bg-[#4A4A30] transition-all flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : `Sign In as ${roles.find(r => r.id === role)?.label}`}
          </button>
        </form>
      </div>
    </div>
  );
};

// --- MAIN APP COMPONENT ---
export default function App() {
  const [auth, setAuth] = useState<{ role: string; user: any; department: string | null } | null>(() => {
    const savedRole = localStorage.getItem('iae_role');
    const savedDept = localStorage.getItem('iae_dept');
    const savedUser = localStorage.getItem('iae_user');
    return savedRole && savedUser ? { role: savedRole, user: JSON.parse(savedUser), department: savedDept !== 'null' ? savedDept : null } : null;
  });

  const handleLogin = (role: string, user: any, dept: string | null) => {
    localStorage.setItem('iae_role', role);
    localStorage.setItem('iae_dept', String(dept));
    localStorage.setItem('iae_user', JSON.stringify(user));
    setAuth({ role, user, department: dept });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('iae_role');
    localStorage.removeItem('iae_dept');
    localStorage.removeItem('iae_user');
    setAuth(null);
  };

  if (!auth) {
    return <LoginView onLogin={handleLogin} />;
  }

  // Role-based Conditional Rendering (Auth Gateway)
  switch (auth.role) {
    case 'controller':
      return <ControllerDashboard user={auth.user} onLogout={handleLogout} />;
    case 'hod':
      return <HODDashboard user={auth.user} department={auth.department || ''} onLogout={handleLogout} />;
    case 'admin':
      return <AdminDashboard user={auth.user} department={auth.department || ''} onLogout={handleLogout} />;
    case 'faculty':
      return <FacultyDashboard user={auth.user} department={auth.department || ''} onLogout={handleLogout} />;
    case 'student':
      return <StudentDashboard user={auth.user} department={auth.department || ''} onLogout={handleLogout} />;
    default:
      return <LoginView onLogin={handleLogin} />;
  }
}
