import axios from 'axios';
import type { User } from '../context/auth-context';

// The backend's free hosting tier sleeps when idle, and the first request after
// that has been measured at over 90 s. Login and signup are usually that first
// request, so they get a longer timeout than everything else.
export const AUTH_TIMEOUT_MS = 90_000;

// These forms show their own "Invalid email or password"; the global 401
// redirect below would reload the page and wipe that message.
const AUTH_FORM_PATHS = ['/auth/login', '/auth/admin-login', '/auth/register'];

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  // Without a timeout a stalled backend response (e.g. during a workflow run)
  // leaves the request pending forever and the UI stuck on its loading state.
  timeout: 30000,
});

// Request interceptor to add the auth token header to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle 401 Unauthorized errors globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error.config?.url ?? '';
    if (error.response && error.response.status === 401 && !AUTH_FORM_PATHS.includes(url)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!['/login', '/signup'].includes(window.location.pathname)) {
        window.location.href = '/login?session=expired';
      }
    }
    return Promise.reject(error);
  }
);

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// Never start a session from a response that doesn't contain one.
const assertTokenResponse = (data: unknown): TokenResponse => {
  const body = data as Partial<TokenResponse> | null;
  if (!body || typeof body.access_token !== 'string' || !body.access_token || typeof body.user?.id !== 'string') {
    throw new Error('Unexpected response from the server.');
  }
  return body as TokenResponse;
};

/** The signed-in user's own profile; used to confirm a stored session is still valid. */
export const fetchMe = async (): Promise<User> => {
  const { data } = await apiClient.get('/auth/me');
  return data;
};

/** Fire-and-forget request that starts waking a sleeping backend before the user submits. */
export const wakeServer = () => {
  apiClient.get('/monitoring/health', { timeout: AUTH_TIMEOUT_MS }).catch(() => undefined);
};

export const fetchOverview = async (workflowId?: string) => {
  const params = workflowId ? { workflow_id: workflowId } : {};
  const { data } = await apiClient.get('/dashboard/overview', { params });
  return data;
};

export const fetchSentiment = async (workflowId?: string) => {
  const params = workflowId ? { workflow_id: workflowId } : {};
  const { data } = await apiClient.get('/dashboard/sentiment', { params });
  return data;
};

export const fetchTrends = async (workflowId?: string) => {
  const params = workflowId ? { workflow_id: workflowId } : {};
  const { data } = await apiClient.get('/dashboard/trends', { params });
  return data;
};

export const fetchRecentActivity = async () => {
  const { data } = await apiClient.get('/dashboard/recent-activity');
  return data;
};

export const fetchWorkflows = async () => {
  const { data } = await apiClient.get('/workflows/');
  return data;
};

export const createWorkflow = async (payload: { query: string; sources: string[] }) => {
  const { data } = await apiClient.post('/workflows/', payload);
  return data;
};

export const fetchReports = async () => {
  const { data } = await apiClient.get('/reports/');
  return data;
};

export const deleteWorkflow = async (id: string) => {
  const { data } = await apiClient.delete(`/workflows/${id}`);
  return data;
};

export const login = async (data: URLSearchParams) => {
  const res = await apiClient.post('/auth/login', data, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: AUTH_TIMEOUT_MS,
  });
  return assertTokenResponse(res.data);
};

export const adminLogin = async (data: URLSearchParams) => {
  const res = await apiClient.post('/auth/admin-login', data, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: AUTH_TIMEOUT_MS,
  });
  return assertTokenResponse(res.data);
};

export const deleteReport = async (id: string) => {
  const { data } = await apiClient.delete(`/reports/${id}`);
  return data;
};

interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
}

// Returns the created user, not a session; callers sign in afterwards.
export const register = async (data: RegisterPayload): Promise<User> => {
  const res = await apiClient.post('/auth/register', data, { timeout: AUTH_TIMEOUT_MS });
  return res.data;
};

export const fetchUsers = async () => {
  const { data } = await apiClient.get('/auth/users');
  return data;
};

export const downloadPdf = async (id: string) => {
  const response = await apiClient.get(`/reports/${id}/export/pdf`, {
    responseType: 'blob',
  });
  return response.data;
};

// ── Ask AI ──────────────────────────────────────────────────

// An answer is one embedding call and one Gemini call, after the workflow's
// data is prepared, so it gets twice the default timeout.
export const ASK_TIMEOUT_MS = 60_000;

export interface AskStatus {
  indexed: boolean;
  chunk_count: number;
  chunk_total: number;
  indexing: boolean;
  simulated_share: number;
  item_count: number;
  workflow_status: string;
  query: string;
}

export interface AskCitation {
  id: number;
  source: string;
  text: string;
  sentiment_label: string | null;
  simulated: boolean;
  url?: string | null;
}

export interface AskAnswer {
  answer_status: 'answered' | 'partial' | 'not_covered';
  answer: string;
  citations: AskCitation[];
  retrieved_count: number;
}

export interface AskTurn {
  role: 'user' | 'assistant';
  content: string;
}

export const fetchAskStatus = async (workflowId: string): Promise<AskStatus> => {
  const { data } = await apiClient.get(`/workflows/${workflowId}/ask/status`);
  return data;
};

/** Resolves to null while the workflow's data is still being prepared (HTTP 202). */
export const askWorkflow = async (workflowId: string, question: string, history: AskTurn[]): Promise<AskAnswer | null> => {
  const res = await apiClient.post(`/workflows/${workflowId}/ask`, { question, history }, { timeout: ASK_TIMEOUT_MS });
  return res.status === 202 ? null : res.data;
};
