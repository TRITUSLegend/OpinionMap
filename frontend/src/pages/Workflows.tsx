import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Play, CheckCircle, XCircle, Clock, Trash2, MessageSquareText } from 'lucide-react';
import { fetchWorkflows, deleteWorkflow } from '../api/client';
import { NewWorkflowModal } from '../components/workflows/NewWorkflowModal';
import { SkeletonRows } from '../components/ui/SkeletonRows';

interface WorkflowItem {
  id: string;
  query: string;
  status: string;
  sources: string[];
  created_at: string;
}

export const Workflows = () => {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Used by the delete handler and the new-workflow modal to refresh on demand.
  const refetchWorkflows = async () => {
    try {
      const data = await fetchWorkflows() as { workflows?: WorkflowItem[] };
      setWorkflows(data.workflows || []);
    } catch (error) {
      console.error("Failed to fetch workflows", error);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetchWorkflows()
        .then((data: { workflows?: WorkflowItem[] }) => {
          if (!cancelled) setWorkflows(data.workflows || []);
        })
        .catch((error) => {
          console.error("Failed to fetch workflows", error);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    poll();
    const interval = setInterval(poll, 15000); // Polling every 15s
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Status colours are UI-state tokens, always paired with an icon and a label.
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-success" />;
      case 'auto_approved': return <CheckCircle className="w-4 h-4 text-warning" />;
      case 'running': return <Play className="w-4 h-4 text-fg animate-pulse" />;
      case 'failed': return <XCircle className="w-4 h-4 text-danger" />;
      default: return <Clock className="w-4 h-4 text-subtle" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Workflows</h1>
          <p className="text-muted text-sm mt-1">Manage and track your autonomous research agents</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          New Research
        </button>
      </div>

      <div className="card overflow-hidden">
        {/* Bounded scroll area so the column headers can stay pinned. */}
        <div className="overflow-auto max-h-[min(70vh,720px)]">
          <table className="table-sticky w-full text-left text-sm min-w-[800px]">
            <thead className="bg-surface-2 border-b border-border">
              <tr>
                <th scope="col" className="caption px-4 py-3">Query</th>
                <th scope="col" className="caption px-4 py-3">Sources</th>
                <th scope="col" className="caption px-4 py-3">Status</th>
                <th scope="col" className="caption px-4 py-3">Date</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border" aria-busy={loading}>
              {loading ? (
                <SkeletonRows columns={5} />
              ) : workflows.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted">No workflows found. Start a new research task!</td></tr>
              ) : (
                workflows.map((wf) => (
                  <tr key={wf.id} className="hover:bg-surface-2 transition-colors duration-[120ms]">
                    <td className="px-4 py-3 font-medium text-fg">{wf.query}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 flex-wrap">
                        {wf.sources.map((s: string) => (
                          <span key={s} className="px-2 py-0.5 text-xs rounded-sm bg-surface-2 border border-border text-muted capitalize">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span aria-hidden="true">{getStatusIcon(wf.status)}</span>
                        <span className="capitalize text-fg">{wf.status === 'auto_approved' ? 'Auto Approved' : wf.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap tabular-nums">{new Date(wf.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {['completed', 'auto_approved'].includes(wf.status) ? (
                        <Link to={`/workflows/${wf.id}/ask`} className="btn btn-ghost" aria-label={`Ask AI about “${wf.query}”`}>
                          <MessageSquareText className="w-4 h-4" aria-hidden="true" />
                          Ask AI
                        </Link>
                      ) : (
                        // Not a disabled <button>: those drop out of the tab order and show no tooltip.
                        <span
                          className="btn btn-ghost opacity-60"
                          role="link"
                          aria-disabled="true"
                          tabIndex={0}
                          title="Ask AI opens once this run completes"
                          aria-label={`Ask AI about “${wf.query}”, available once this run completes`}
                        >
                          <MessageSquareText className="w-4 h-4" aria-hidden="true" />
                          Ask AI
                        </span>
                      )}
                      <button
                        onClick={async () => {
                          if(confirm('Are you sure you want to delete this workflow?')) {
                            try {
                              await deleteWorkflow(wf.id);
                              await refetchWorkflows();
                            } catch (e) {
                              console.error(e);
                            }
                          }
                        }}
                        className="icon-btn icon-btn-danger w-8 h-8"
                        title="Delete Workflow"
                        aria-label={`Delete workflow “${wf.query}”`}
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
            refetchWorkflows();
          }}
        />
      )}
    </div>
  );
};
