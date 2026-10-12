import { useState, useEffect, useRef } from 'react';
import { Workflow, FileText, Activity, PieChart, ChevronDown, Check, ChartScatter } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell } from 'recharts';
import { MetricCard } from '../components/dashboard/MetricCard';
import { fetchOverview, fetchSentiment, fetchTrends, fetchWorkflows } from '../api/client';
import { useChartColors, type ChartColors } from '../context/theme-context';

interface WorkflowSummary {
  id: string;
  query: string;
  status: string;
  sources: string[];
  created_at: string;
  completed_at: string | null;
}

interface OverviewMetrics {
  total_workflows: number;
  completed_workflows: number;
  total_reports: number;
  avg_sentiment_score: number;
  total_data_points: number;
  active_schedules: number;
}

interface SentimentPoint {
  label: string;
  count: number;
  percentage: number;
}

interface TrendPoint {
  date: string;
  positive: number;
  negative: number;
  neutral: number;
}

const SENTIMENT_SERIES = [
  { key: 'positive', label: 'Positive' },
  { key: 'neutral', label: 'Neutral' },
  { key: 'negative', label: 'Negative' },
] as const;

// Sentiment colours are design tokens (see index.css): a diverging pair with a
// grey midpoint, reserved for data.
const sentimentColor = (colors: ChartColors, label: string | undefined) => {
  const key = label?.toLowerCase();
  return key === 'positive' || key === 'negative' ? colors[key] : colors.neutral;
};

const tooltipStyle = {
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  color: 'var(--fg)',
  fontSize: '12px',
  boxShadow: '0 8px 24px -12px rgb(0 0 0 / 0.25)',
};

export const Dashboard = () => {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [sentimentData, setSentimentData] = useState<SentimentPoint[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const colors = useChartColors();

  // Tracks which workflow id the charts currently hold data for, so the
  // selection effect below does not re-request what the mount effect just loaded.
  const loadedForRef = useRef<string | null | undefined>(undefined);

  // Mount: load the workflow list and the dashboard data in a single pass.
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      try {
        const data = await fetchWorkflows() as { workflows?: WorkflowSummary[] };
        const completed = (data.workflows || []).filter((w) =>
          ['completed', 'auto_approved'].includes(w.status)
        );
        if (cancelled) return;

        setWorkflows(completed);

        // No completed workflows: nothing to chart, so skip the data requests.
        if (completed.length === 0) return;

        const wfId = completed[0].id;
        setSelectedWorkflowId(wfId);
        loadedForRef.current = wfId;

        const [overviewRes, sentimentRes, trendsRes] = await Promise.allSettled([
          fetchOverview(wfId),
          fetchSentiment(wfId),
          fetchTrends(wfId),
        ]);
        if (cancelled) return;

        setMetrics(
          overviewRes.status === 'fulfilled'
            ? overviewRes.value
            : { total_workflows: 0, completed_workflows: 0, total_reports: 0, avg_sentiment_score: 0, total_data_points: 0, active_schedules: 0 }
        );
        setSentimentData(
          sentimentRes.status === 'fulfilled' && Array.isArray(sentimentRes.value)
            ? sentimentRes.value : []
        );
        setTrendData(
          trendsRes.status === 'fulfilled' && Array.isArray(trendsRes.value)
            ? trendsRes.value : []
        );
      } catch (e) {
        if (!cancelled) console.warn('Dashboard init failed', e);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setChartLoading(false);
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // Refetch only when the user actually picks a different workflow.
  useEffect(() => {
    if (selectedWorkflowId === null) return;
    if (selectedWorkflowId === loadedForRef.current) return;

    let cancelled = false;

    const refetch = async () => {
      setChartLoading(true);
      loadedForRef.current = selectedWorkflowId;
      const [overviewRes, sentimentRes, trendsRes] = await Promise.allSettled([
        fetchOverview(selectedWorkflowId),
        fetchSentiment(selectedWorkflowId),
        fetchTrends(selectedWorkflowId),
      ]);
      if (cancelled) return;

      if (overviewRes.status === 'fulfilled') setMetrics(overviewRes.value);
      if (sentimentRes.status === 'fulfilled') {
        setSentimentData(Array.isArray(sentimentRes.value) ? sentimentRes.value : []);
      }
      if (trendsRes.status === 'fulfilled') {
        setTrendData(Array.isArray(trendsRes.value) ? trendsRes.value : []);
      }
      setChartLoading(false);
    };

    refetch();
    return () => { cancelled = true; };
  }, [selectedWorkflowId]);

  const selectedWorkflow = workflows.find(w => w.id === selectedWorkflowId);
  const noData = !metrics || metrics.total_data_points === 0;

  if (loading) {
    return (
      <div className="space-y-8" role="status" aria-label="Loading dashboard">
        <div className="space-y-2">
          <div className="skeleton h-8 w-72 max-w-full" />
          <div className="skeleton h-4 w-56 max-w-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[118px] rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="skeleton h-[420px] rounded-lg lg:col-span-2" />
          <div className="skeleton h-[420px] rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8" onClick={() => dropdownOpen && setDropdownOpen(false)}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title">Market Intelligence Overview</h1>
          <p className="text-muted mt-1 text-sm">
            {selectedWorkflow
              ? <>Showing results for <span className="text-fg font-medium">“{selectedWorkflow.query}”</span></>
              : 'Select a workflow to see its analysis'}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Workflow Selector Dropdown */}
          {workflows.length > 0 && (
            <div className="relative w-full sm:w-72" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className="btn btn-secondary w-full justify-between"
                aria-haspopup="listbox"
                aria-expanded={dropdownOpen}
              >
                <span className="truncate">
                  {selectedWorkflow ? selectedWorkflow.query : 'All Workflows'}
                </span>
                <ChevronDown className={`w-4 h-4 shrink-0 text-subtle transition-transform duration-[180ms] ${dropdownOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>

              {dropdownOpen && (
                <div
                  className="absolute right-0 mt-1.5 w-full max-h-80 overflow-y-auto bg-surface border border-border rounded-lg shadow-[0_12px_32px_-16px_rgb(0_0_0/0.3)] z-40 py-1 animate-pop-in origin-top"
                  role="listbox"
                  aria-label="Workflow"
                >
                  {workflows.map(wf => (
                    <button
                      key={wf.id}
                      role="option"
                      aria-selected={wf.id === selectedWorkflowId}
                      onClick={() => { setSelectedWorkflowId(wf.id); setDropdownOpen(false); }}
                      className="w-full px-3 py-2.5 text-left text-sm hover:bg-surface-2 flex items-center justify-between gap-2 transition-colors duration-[120ms] focus-visible:-outline-offset-2"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-fg truncate">{wf.query}</p>
                        <p className="text-xs text-subtle mt-0.5 tabular-nums">{new Date(wf.created_at).toLocaleDateString()}</p>
                      </div>
                      {wf.id === selectedWorkflowId && (
                        <Check className="w-4 h-4 text-fg shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button className="btn btn-secondary shrink-0">
            <Activity className="w-4 h-4" aria-hidden="true" />
            <span className="hidden md:inline">Live</span>
          </button>
        </div>
      </div>

      {/* No workflows state */}
      {workflows.length === 0 && (
        <div className="card p-12 text-center">
          <ChartScatter className="w-8 h-8 mx-auto mb-4 text-subtle" aria-hidden="true" />
          <h3 className="text-lg font-semibold mb-1">No completed workflows yet</h3>
          <p className="text-muted text-sm">Create a new research workflow to start seeing analytics here.</p>
        </div>
      )}

      {workflows.length > 0 && (
        <div className={`space-y-8 transition-opacity duration-[180ms] ${chartLoading ? 'opacity-60' : ''}`} aria-busy={chartLoading}>
          {chartLoading && (
            <p className="sr-only" role="status">Loading data for selected workflow</p>
          )}

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <MetricCard
              title="Data Points Scraped"
              value={metrics?.total_data_points || 0}
              icon={<Activity className="w-4 h-4" />}
            />
            <MetricCard
              title="Reports Generated"
              value={metrics?.total_reports || 0}
              icon={<FileText className="w-4 h-4" />}
            />
            <MetricCard
              title="Avg Sentiment Score"
              value={`${((metrics?.avg_sentiment_score || 0) * 100).toFixed(1)}%`}
              icon={<PieChart className="w-4 h-4" />}
            />
            <MetricCard
              title="Total Workflows"
              value={metrics?.total_workflows || 0}
              icon={<Workflow className="w-4 h-4" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            {/* Sentiment by Source Chart */}
            <section className="card p-5 md:p-6 lg:col-span-2 min-w-0" aria-labelledby="trend-heading">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 mb-5">
                <div className="min-w-0">
                  <h2 id="trend-heading" className="text-base font-semibold text-fg">Sentiment by Source</h2>
                  <p className="text-xs text-subtle mt-0.5 truncate">
                    {selectedWorkflow ? `For “${selectedWorkflow.query}”` : 'All workflows combined'}
                  </p>
                </div>
                {!noData && <SentimentLegend colors={colors} />}
              </div>
              <div className="h-80 min-w-0">
                {noData ? (
                  <div className="h-full flex items-center justify-center text-muted text-sm">
                    No scraped data available for this workflow yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="99%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid stroke={colors.grid} vertical={false} />
                      <XAxis dataKey="date" stroke={colors.axis} tick={{ fill: colors.tick, fontSize: 12 }} tickLine={false} tickMargin={8} />
                      <YAxis tick={{ fill: colors.tick, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: 'var(--muted)', marginBottom: 4 }}
                        itemStyle={{ color: 'var(--fg)', padding: 0 }}
                        cursor={{ stroke: colors.axis, strokeWidth: 1 }}
                      />
                      {SENTIMENT_SERIES.map(({ key, label }) => (
                        <Area
                          key={key}
                          type="monotone"
                          dataKey={key}
                          name={label}
                          stroke={colors[key]}
                          strokeWidth={2}
                          fill={colors[key]}
                          fillOpacity={0.08}
                          dot={false}
                          activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
                          isAnimationActive={false}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            {/* Overall Sentiment Pie */}
            <section className="card p-5 md:p-6 min-w-0" aria-labelledby="overall-heading">
              <h2 id="overall-heading" className="text-base font-semibold text-fg">Overall Sentiment</h2>
              <p className="text-xs text-subtle mt-0.5 mb-5 truncate">
                {selectedWorkflow ? `For “${selectedWorkflow.query}”` : 'All workflows combined'}
              </p>
              <div className="h-64 min-w-0">
                {noData ? (
                  <div className="h-full flex items-center justify-center text-muted text-sm">
                    No data yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="99%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={sentimentData}
                        innerRadius={60}
                        outerRadius={80}
                        dataKey="count"
                        nameKey="label"
                        stroke={colors.surface}
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {sentimentData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={sentimentColor(colors, entry.label)} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--fg)', padding: 0 }} />
                    </RechartsPie>
                  </ResponsiveContainer>
                )}
              </div>
              <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-4">
                {sentimentData.map((entry) => (
                  <li key={entry.label} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sentimentColor(colors, entry.label) }} aria-hidden="true"></span>
                    <span className="text-muted capitalize">{entry.label}</span>
                    {typeof entry.percentage === 'number' && (
                      <span className="text-fg font-medium tabular-nums">{Math.round(entry.percentage)}%</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};

const SentimentLegend = ({ colors }: { colors: ChartColors }) => (
  <ul className="flex flex-wrap gap-x-4 gap-y-1">
    {SENTIMENT_SERIES.map(({ key, label }) => (
      <li key={key} className="flex items-center gap-1.5 text-xs text-muted">
        <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: colors[key] }} aria-hidden="true" />
        {label}
      </li>
    ))}
  </ul>
);
