import React, { useState, useEffect } from 'react';
import { ShieldCheck, LogOut, Loader2, UserPlus, Table, AlertCircle, CheckCircle2, Mail, Lock, Building2, Hash } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

interface HODProfile {
  id: string;
  department_name: string;
  branch_code: string;
  email_id: string;
  created_at: string;
}

export const ControllerDashboard = ({ user, onLogout }: { user: any; onLogout: () => void }) => {
  const [hods, setHods] = useState<HODProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    departmentName: '',
    branchCode: '',
    email: '',
    password: '',
  });

  const fetchHODs = async () => {
    setFetching(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('hod_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching HODs:', error);
      setFetchError(error.message);
    } else {
      setHods(data || []);
    }
    setFetching(false);
  };

  useEffect(() => {
    fetchHODs();
  }, []);

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/provision-hod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        setFormData({ departmentName: '', branchCode: '', email: '', password: '' });
        fetchHODs(); // Refresh list
      } else {
        throw new Error(result.message);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex font-sans">
      {/* Sidebar */}
      <aside className="w-72 bg-[#1A1A1A] text-white flex flex-col shadow-2xl">
        <div className="p-8 border-b border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#5A5A40] rounded-xl flex items-center justify-center shadow-lg">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <span className="font-serif text-xl tracking-tight">UECU Portal</span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">Controller Authority</p>
        </div>

        <nav className="flex-1 p-6 space-y-2">
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl text-white">
            <UserPlus className="w-5 h-5 text-[#5A5A40]" />
            <span className="text-sm font-medium">HOD Management</span>
          </div>
        </nav>

        <div className="p-6 border-t border-white/10">
          <div className="flex items-center gap-3 px-4 py-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold uppercase text-white">
              {user.email[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate text-white">Controller HQ</p>
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
          <header className="mb-12">
            <h1 className="text-4xl font-serif text-[#1A1A1A] mb-2">HOD Provisioning</h1>
            <p className="text-gray-500 italic">Create and manage Head of Department accounts across branches.</p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Provisioning Form */}
            <section className="lg:col-span-1">
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
                <h2 className="text-xl font-serif mb-6 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[#5A5A40]" />
                  New HOD Account
                </h2>

                <form onSubmit={handleProvision} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">Department Name</label>
                    <div className="relative">
                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        required
                        value={formData.departmentName}
                        onChange={(e) => setFormData({ ...formData, departmentName: e.target.value })}
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all text-sm"
                        placeholder="e.g. Computer Science"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">Branch Code</label>
                    <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        required
                        value={formData.branchCode}
                        onChange={(e) => setFormData({ ...formData, branchCode: e.target.value })}
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all text-sm"
                        placeholder="e.g. CS-01"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">HOD Email</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all text-sm"
                        placeholder="hod.cs@uecu.ac.in"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="password"
                        required
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all text-sm"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  {message && (
                    <div className={cn(
                      "flex items-center gap-2 text-sm p-4 rounded-xl",
                      message.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                    )}>
                      {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                      {message.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-[#5A5A40] text-white rounded-xl font-bold shadow-lg hover:bg-[#4A4A30] transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Provision Account'}
                  </button>
                </form>
              </div>
            </section>

            {/* HOD Directory */}
            <section className="lg:col-span-2">
              <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                  <h2 className="text-xl font-serif flex items-center gap-2">
                    <Table className="w-5 h-5 text-[#5A5A40]" />
                    HOD Directory
                  </h2>
                  <button 
                    onClick={fetchHODs}
                    className="text-xs font-bold uppercase tracking-wider text-[#5A5A40] hover:underline"
                  >
                    Refresh
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="px-8 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Department</th>
                        <th className="px-8 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Branch Code</th>
                        <th className="px-8 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Email ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {fetching ? (
                        <tr>
                          <td colSpan={3} className="px-8 py-12 text-center">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                          </td>
                        </tr>
                      ) : fetchError ? (
                        <tr>
                          <td colSpan={3} className="px-8 py-12 text-center text-red-500 text-sm">
                            <div className="flex flex-col items-center gap-2">
                              <AlertCircle className="w-6 h-6" />
                              <p>Error loading directory: {fetchError}</p>
                              <p className="text-xs text-gray-400 uppercase">Check RLS Policies in Supabase</p>
                            </div>
                          </td>
                        </tr>
                      ) : hods.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-8 py-12 text-center text-gray-400 italic text-sm">
                            No HOD accounts provisioned yet.
                          </td>
                        </tr>
                      ) : (
                        hods.map((hod) => (
                          <tr key={hod.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-8 py-5 text-sm font-medium text-gray-900">{hod.department_name}</td>
                            <td className="px-8 py-5 text-sm text-gray-600">
                              <span className="px-2 py-1 bg-gray-100 rounded text-xs font-bold">{hod.branch_code}</span>
                            </td>
                            <td className="px-8 py-5 text-sm text-gray-500 font-mono">{hod.email_id}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};
