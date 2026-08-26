import { useState } from 'react';
import { X } from 'lucide-react';
import { createWorkflow } from '../../api/client';

export const NewWorkflowModal = ({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) => {
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState({ twitter: true, youtube: true, reddit: true });
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="glass-card w-full max-w-lg rounded-2xl p-6 animate-slide-up relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <X className="w-6 h-6" />
        </button>
        
        <h2 className="text-2xl font-bold mb-6">New Research Workflow</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Research Query
            </label>
            <input 
              type="text" 
              required
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., iPhone 17 battery life user sentiment"
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Data Sources
            </label>
            <div className="flex gap-4">
              {['twitter', 'youtube', 'reddit'].map((source) => (
                <label key={source} className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={sources[source as keyof typeof sources]}
                    onChange={(e) => setSources({...sources, [source]: e.target.checked})}
                    className="rounded border-gray-600 bg-black/20 text-accent focus:ring-accent w-5 h-5 accent-accent"
                  />
                  <span className="capitalize">{source}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="px-6 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={submitting || !query}
              className="glass-button px-6 py-2 rounded-xl font-medium text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Starting Agents...' : 'Launch Agents'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
