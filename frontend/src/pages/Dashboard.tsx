import { useState, useEffect } from 'react';
import { Workflow, FileText, Activity, PieChart, ChevronDown, Check } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell } from 'recharts';
import { MetricCard } from '../components/dashboard/MetricCard';
import { fetchOverview, fetchSentiment, fetchTrends, fetchWorkflows } from '../api/client';

const SENTIMENT_COLORS: { [key: string]: string } = {
  'positive': '#76b900',
  'negative': '#ef4444',
  'neutral':  '#525252',
};

export const Dashboard = () => {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [metrics, setMetrics] = useState<any>(null);
  const [sentimentData, setSentimentData] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

  // Load the workflow list once on mount
  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        const data = await fetchWorkflows();
        const completed = (data.workflows || []).filter((w: any) => w.status === 'completed');
        setWorkflows(completed);
        // Auto-select the most recent completed workflow if any exist
        if (completed.length > 0) {
          setSelectedWorkflowId(completed[0].id);
        }
      } catch (e) {
        console.warn('Failed to load workflows for selector', e);
      }
    };
    loadWorkflows();
  }, []);

  // Re-fetch charts whenever selected workflow changes
  useEffect(() => {
    const loadDashboard = async () => {
      // Don't fetch until we know whether there are workflows (avoid double-fetch)
      if (workflows.length === 0 && selectedWorkflowId === null) {
        // Still loading workflows list OR no workflows exist yet
        setLoading(false);
        return;
      }

      setChartLoading(true);
      try {
        const wfId = selectedWorkflowId ?? undefined;
        const [overviewRes, sentimentRes, trendsRes] =
          await Promise.allSettled([
            fetchOverview(wfId),
            fetchSentiment(wfId),
            fetchTrends(wfId),
          ]);

        if (overviewRes.status === 'fulfilled') {
          setMetrics(overviewRes.value);
        } else {
          setMetrics({ total_workflows: 0, total_reports: 0, avg_sentiment_score: 0, total_data_points: 0 });
        }

        if (sentimentRes.status === 'fulfilled') {
          setSentimentData(Array.isArray(sentimentRes.value) ? sentimentRes.value : []);
        } else {
          setSentimentData([]);
        }

        if (trendsRes.status === 'fulfilled') {
          setTrendData(Array.isArray(trendsRes.value) ? trendsRes.value : []);
        } else {
          setTrendData([]);
        }
      } finally {
        setLoading(false);
        setChartLoading(false);
      }
    };

    loadDashboard();
  }, [selectedWorkflowId, workflows.length]);

  const selectedWorkflow = workflows.find(w => w.id === selectedWorkflowId);
  const noData = !metrics || metrics.total_data_points === 0;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-3 text-electric-blue">
          <div className="w-4 h-4 rounded-full bg-blue-500 animate-ping"></div>
          <span className="text-xl font-medium">Loading AI Insights...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in" onClick={() => dropdownOpen && setDropdownOpen(false)}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Market Intelligence Overview</h1>
          <p className="text-gray-400 mt-1 text-sm md:text-base">
            {selectedWorkflow
              ? <>Showing results for: <span className="text-white font-medium">"{selectedWorkflow.query}"</span></>
              : 'Select a workflow to see its analysis'}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Workflow Selector Dropdown */}
          {workflows.length > 0 && (
            <div className="relative w-full sm:w-72" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className="w-full glass-button px-4 py-2 rounded-xl font-medium text-white shadow-lg flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate">
                  {selectedWorkflow ? `🔍 ${selectedWorkflow.query}` : 'All Workflows'}
                </span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-full bg-[#0d1424] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                  {workflows.map(wf => (
                    <button
                      key={wf.id}
                      onClick={() => { setSelectedWorkflowId(wf.id); setDropdownOpen(false); }}
                      className="w-full px-4 py-3 text-left text-sm hover:bg-white/5 flex items-center justify-between gap-2 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-white truncate">"{wf.query}"</p>
                        <p className="text-xs text-gray-500 mt-0.5">{new Date(wf.created_at).toLocaleDateString()}</p>
                      </div>
                      {wf.id === selectedWorkflowId && (
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button className="glass-button px-4 py-2 text-sm rounded-xl font-medium text-white shadow-lg flex items-center gap-2 shrink-0">
            <Activity className="w-4 h-4" />
            <span className="hidden md:inline">Live</span>
          </button>
        </div>
      </div>

      {/* No workflows state */}
      {workflows.length === 0 && (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="text-5xl mb-4">🚀</div>
          <h3 className="text-xl font-bold mb-2">No completed workflows yet</h3>
          <p className="text-gray-400">Create a new research workflow to start seeing analytics here.</p>
        </div>
      )}

      {workflows.length > 0 && (
        <>
          {/* Chart loading overlay */}
          {chartLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-ping"></div>
              Loading data for selected workflow…
            </div>
          )}

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              title="Data Points Scraped"
              value={metrics?.total_data_points || 0}
              icon={<Activity className="w-6 h-6" />}
            />
            <MetricCard
              title="Reports Generated"
              value={metrics?.total_reports || 0}
              icon={<FileText className="w-6 h-6" />}
            />
            <MetricCard
              title="Avg Sentiment Score"
              value={`${((metrics?.avg_sentiment_score || 0) * 100).toFixed(1)}%`}
              icon={<PieChart className="w-6 h-6" />}
            />
            <MetricCard
              title="Total Workflows"
              value={metrics?.total_workflows || 0}
              icon={<Workflow className="w-6 h-6" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sentiment by Source Chart */}
            <div className="glass-card p-6 lg:col-span-2">
              <h2 className="text-xl font-semibold text-white mb-1 tracking-tight">Sentiment by Source</h2>
              <p className="text-xs text-gray-500 mb-6">
                {selectedWorkflow ? `For: "${selectedWorkflow.query}"` : 'All workflows combined'}
              </p>
              <div className="h-80 min-w-0">
                {noData ? (
                  <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                    No scraped data available for this workflow yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="99%" height="100%">
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="colorPositive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#76b900" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#76b900" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorNeutral" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#525252" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#525252" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="date" stroke="#525252" axisLine={false} tickLine={false} />
                      <YAxis stroke="#525252" axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0a0a0a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Area type="monotone" dataKey="positive" stroke="#76b900" fillOpacity={1} fill="url(#colorPositive)" strokeWidth={2} />
                      <Area type="monotone" dataKey="negative" stroke="#ef4444" fillOpacity={1} fill="url(#colorNegative)" strokeWidth={2} />
                      <Area type="monotone" dataKey="neutral"  stroke="#525252" fillOpacity={1} fill="url(#colorNeutral)"  strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Overall Sentiment Pie */}
            <div className="glass-card p-6 rounded-2xl">
              <h2 className="text-xl font-bold mb-1">Overall Sentiment</h2>
              <p className="text-xs text-gray-500 mb-6">
                {selectedWorkflow ? `For: "${selectedWorkflow.query}"` : 'All workflows combined'}
              </p>
              <div className="h-64 min-w-0">
                {noData ? (
                  <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                    No data yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="99%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={sentimentData}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="count"
                        nameKey="label"
                      >
                        {sentimentData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={SENTIMENT_COLORS[entry.label?.toLowerCase()] || '#6b7280'} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0a0a0a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                      />
                    </RechartsPie>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="flex justify-center gap-4 mt-4">
                {sentimentData.map((entry) => (
                  <div key={entry.label} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SENTIMENT_COLORS[entry.label?.toLowerCase()] || '#6b7280' }}></div>
                    <span className="text-sm text-gray-400">{entry.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
