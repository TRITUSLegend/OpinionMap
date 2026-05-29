import { useState, useEffect } from 'react';
import { Users as UsersIcon, Shield, Mail, Calendar } from 'lucide-react';
import { fetchUsers } from '../api/client';

export const Users = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    try {
      const data = await fetchUsers();
      setUsers(data || []);
    } catch (error) {
      console.error("Failed to fetch users", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">User Management</h1>
          <p className="text-gray-400 mt-1">View and manage registered accounts</p>
        </div>
        <div className="glass-button px-6 py-2 rounded-xl font-medium text-white shadow-lg flex items-center gap-2">
          <UsersIcon className="w-5 h-5" />
          {users.length} Users Total
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-white/5 border-b border-white/5">
              <tr>
                <th className="p-4 font-medium text-gray-400">User</th>
                <th className="p-4 font-medium text-gray-400">Role</th>
                <th className="p-4 font-medium text-gray-400">Status</th>
                <th className="p-4 font-medium text-gray-400">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-400">Loading users...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-400">No users found.</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-electric-blue to-violet flex items-center justify-center text-white font-bold shrink-0">
                          {u.full_name?.substring(0, 2).toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className="font-medium">{u.full_name || 'Anonymous User'}</p>
                          <div className="flex items-center gap-1 text-sm text-gray-400">
                            <Mail className="w-3 h-3" />
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-3 py-1 text-xs rounded-full flex items-center gap-1 w-max ${u.role === 'admin' ? 'bg-violet/20 text-violet border border-violet/20' : 'bg-white/5 text-gray-300 border border-white/10'}`}>
                        {u.role === 'admin' && <Shield className="w-3 h-3" />}
                        <span className="capitalize">{u.role}</span>
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-red-400'}`}></div>
                        <span className="capitalize">{u.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-gray-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(u.created_at).toLocaleDateString()}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
