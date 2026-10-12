import { useState, useEffect } from 'react';
import { Users as UsersIcon, Shield, Mail, Calendar } from 'lucide-react';
import { fetchUsers } from '../api/client';
import { SkeletonRows } from '../components/ui/SkeletonRows';

interface UserItem {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export const Users = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchUsers()
      .then((data: UserItem[]) => {
        if (!cancelled) setUsers(data || []);
      })
      .catch((error) => {
        console.error("Failed to fetch users", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="text-muted text-sm mt-1">View and manage registered accounts</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <UsersIcon className="w-4 h-4" aria-hidden="true" />
          <span><span className="text-fg font-semibold tabular-nums">{users.length}</span> users total</span>
        </div>
      </div>

      <div className="card overflow-hidden">
        {/* Bounded scroll area so the column headers can stay pinned. */}
        <div className="overflow-auto max-h-[min(70vh,720px)]">
          <table className="table-sticky w-full text-left text-sm min-w-[800px]">
            <thead className="bg-surface-2 border-b border-border">
              <tr>
                <th scope="col" className="caption px-4 py-3">User</th>
                <th scope="col" className="caption px-4 py-3">Role</th>
                <th scope="col" className="caption px-4 py-3">Status</th>
                <th scope="col" className="caption px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border" aria-busy={loading}>
              {loading ? (
                <SkeletonRows columns={4} />
              ) : users.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted">No users found.</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-2 transition-colors duration-[120ms]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center text-fg text-xs font-semibold shrink-0" aria-hidden="true">
                          {u.full_name?.substring(0, 2).toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-fg">{u.full_name || 'Anonymous User'}</p>
                          <div className="flex items-center gap-1 text-xs text-muted">
                            <Mail className="w-3 h-3" aria-hidden="true" />
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-sm flex items-center gap-1 w-max border ${u.role === 'admin' ? 'bg-accent text-accent-fg border-accent' : 'bg-surface-2 text-muted border-border'}`}>
                        {u.role === 'admin' && <Shield className="w-3 h-3" aria-hidden="true" />}
                        <span className="capitalize">{u.role}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-success' : 'bg-danger'}`} aria-hidden="true"></div>
                        <span className="text-fg">{u.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <div className="flex items-center gap-1 tabular-nums">
                        <Calendar className="w-3 h-3" aria-hidden="true" />
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
