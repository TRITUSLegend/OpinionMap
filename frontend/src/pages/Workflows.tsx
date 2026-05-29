import { useState, useEffect } from 'react';
import { Plus, Play, CheckCircle, XCircle, Clock, Trash2 } from 'lucide-react';
import { fetchWorkflows, deleteWorkflow } from '../api/client';
import { NewWorkflowModal } from '../components/workflows/NewWorkflowModal';

export const Workflows = () => {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadWorkflows = async () => {
    try {
      const data = await fetchWorkflows();
      setWorkflows(data.workflows || []);
    } catch (error) {
      console.error("Failed to fetch workflows", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflows();
    const interval = setInterval(loadWorkflows, 10000); // Polling every 10s
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'running': return <Play className="w-5 h-5 text-accent animate-pulse" />;
      case 'failed': return <XCircle className="w-5 h-5 text-red-400" />;
      default: return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Workflows</h1>
          <p className="text-gray-400 mt-1">Manage and track your autonomous research agents</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="glass-button px-6 py-2 rounded-xl font-medium text-white shadow-lg flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Research
        </button>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-white/5 border-b border-white/5">
              <tr>
                <th className="p-4 font-medium text-gray-400">Query</th>
                <th className="p-4 font-medium text-gray-400">Sources</th>
                <th className="p-4 font-medium text-gray-400">Status</th>
                <th className="p-4 font-medium text-gray-400">Date</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">Loading workflows...</td></tr>
              ) : workflows.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">No workflows found. Start a new research task!</td></tr>
              ) : (
                workflows.map((wf) => (
                  <tr key={wf.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-medium">{wf.query}</td>
                    <td className="p-4">
                      <div className="flex gap-2 flex-wrap">
                        {wf.sources.map((s: string) => (
                          <span key={s} className="px-2 py-1 text-xs rounded-lg bg-white/10 text-gray-300 capitalize">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(wf.status)}
                        <span className="capitalize">{wf.status}</span>
                      </div>
                    </td>
                    <td className="p-4 text-gray-400 whitespace-nowrap">{new Date(wf.created_at).toLocaleDateString()}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={async () => {
                          if(confirm('Are you sure you want to delete this workflow?')) {
                            try {
                              await deleteWorkflow(wf.id);
                              loadWorkflows();
                            } catch (e) {
                              console.error(e);
                            }
                          }
                        }}
                        className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors shrink-0"
                        title="Delete Workflow"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <NewWorkflowModal 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={() => {
            setIsModalOpen(false);
            loadWorkflows();
          }} 
        />
      )}
    </div>
  );
};
