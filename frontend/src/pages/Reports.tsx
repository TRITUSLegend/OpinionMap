import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Download, Trash2, MessageSquareText } from 'lucide-react';
import { fetchReports, deleteReport } from '../api/client';
import { useToast } from '../components/ui/toast-context';

interface ReportItem {
  id: string;
  workflow_id: string;
  title: string;
  executive_summary: string;
  recommendations?: string[];
  status: string;
  created_at: string;
}

export const Reports = () => {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    fetchReports()
      .then((data: { reports?: ReportItem[] }) => {
        if (!cancelled) setReports(data.reports || []);
      })
      .catch((error) => {
        console.error("Failed to fetch reports", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Executive Reports</h1>
        <p className="text-muted text-sm mt-1">AI-generated summaries and insights</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6" role="status" aria-label="Loading reports">
          {[0, 1].map((i) => <div key={i} className="skeleton h-60 rounded-lg" />)}
        </div>
      ) : reports.length === 0 ? (
        <div className="card text-center p-12 text-muted">
          No reports generated yet. Complete a workflow to see results here.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {reports.map((report) => (
            <article key={report.id} className="card p-5 md:p-6 min-w-0">
              <div className="flex justify-between items-start gap-4 mb-5">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2 rounded-md bg-surface-2 border border-border text-muted shrink-0" aria-hidden="true">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-fg leading-snug">{report.title || "Market Research Report"}</h2>
                    <p className="text-xs text-subtle mt-0.5 tabular-nums">{new Date(report.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Link
                    to={`/workflows/${report.workflow_id}/ask`}
                    className="icon-btn"
                    title="Ask AI about this report's data"
                    aria-label="Ask AI about this report's data"
                  >
                    <MessageSquareText className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={async () => {
                      try {
                        const { downloadPdf } = await import('../api/client');
                        const blob = await downloadPdf(report.id);
                        const url = window.URL.createObjectURL(new Blob([blob]));
                        const link = document.createElement('a');
                        link.href = url;
                        link.setAttribute('download', `report_${report.id.substring(0,8)}.pdf`);
                        document.body.appendChild(link);
                        link.click();
                        link.parentNode?.removeChild(link);
                        window.URL.revokeObjectURL(url);
                      } catch (error) {
                        console.error('Download failed', error);
                        toast('Failed to download the PDF. Please try again.', 'error');
                      }
                    }}
                    className="icon-btn" title="Download PDF" aria-label="Download PDF">
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async () => {
                      if(confirm('Are you sure you want to delete this report?')) {
                        try {
                          await deleteReport(report.id);
                          const data = await fetchReports() as { reports?: ReportItem[] };
                          setReports(data.reports || []);
                        } catch (e) {
                          console.error(e);
                        }
                      }
                    }}
                    className="icon-btn icon-btn-danger"
                    title="Delete Report"
                    aria-label="Delete report"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="mb-5">
                <h3 className="caption mb-1.5">Executive Summary</h3>
                <p className="text-muted text-sm leading-relaxed line-clamp-3">
                  {report.executive_summary}
                </p>
              </div>

              <div>
                <h3 className="caption mb-1.5">Recommendations</h3>
                <ul className="text-sm text-muted list-disc list-inside space-y-1 marker:text-subtle">
                  {(report.recommendations || []).slice(0, 3).map((rec: string, i: number) => (
                    <li key={i} className="truncate">{rec}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
