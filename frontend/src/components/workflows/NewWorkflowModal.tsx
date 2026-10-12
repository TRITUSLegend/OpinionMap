import { useState } from 'react';
import { X } from 'lucide-react';
import { createWorkflow } from '../../api/client';

const SOURCE_LABELS: Record<string, string> = {
  twitter: 'Twitter/X',
  youtube: 'YouTube',
  reddit: 'Reddit',
  hackernews: 'Hacker News',
  bluesky: 'Bluesky',
  news: 'News',
  guardian: 'Guardian',
};

const SOURCE_DESCRIPTIONS: Record<string, string> = {
  twitter: 'Simulated',
  youtube: 'Live / Demo',
  reddit: 'Live / Demo',
  hackernews: 'Live (free)',
  bluesky: 'Live (free)',
  news: 'Live / Demo',
  guardian: 'Live / Demo',
};

export const NewWorkflowModal = ({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) => {
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState({
    twitter: true,
    youtube: true,
    reddit: true,
    hackernews: true,
    bluesky: true,
    news: true,
    guardian: true,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const activeSources = Object.entries(sources)
      .filter(([, isActive]) => isActive)
      .map(([key]) => key);

    try {
      await createWorkflow({ query, sources: activeSources });
      onSuccess();
    } catch (error) {
      console.error("Failed to create workflow", error);
      alert("Failed to create workflow. Check console.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-scrim flex items-center justify-center p-4 z-[70] animate-fade-in">
      <div className="card w-full max-w-lg p-6 animate-sheet-in relative shadow-[0_24px_48px_-24px_rgb(0_0_0/0.4)]">
        <button onClick={onClose} className="icon-btn absolute top-3 right-3" aria-label="Close">
          <X className="w-5 h-5" />
        </button>

        <h2 className="page-title mb-6 pr-10">New research workflow</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="workflow-query" className="block text-sm font-medium text-fg mb-1.5">
              Research query
            </label>
            <input
              id="workflow-query"
              type="text"
              required
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., iPhone 17 battery life user sentiment"
              className="input"
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-fg mb-2">
              Data sources
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
              {Object.keys(sources).map((source) => (
                <label key={source} className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={sources[source as keyof typeof sources]}
                    onChange={(e) => setSources({ ...sources, [source]: e.target.checked })}
                    className="w-4 h-4 accent-accent"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-fg">{SOURCE_LABELS[source]}</span>
                    <span className="text-xs text-subtle ml-1.5">{SOURCE_DESCRIPTIONS[source]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !query}
              className="btn btn-primary"
            >
              {submitting ? 'Starting Agents...' : 'Launch Agents'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
