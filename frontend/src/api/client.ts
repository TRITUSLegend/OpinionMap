import axios from 'axios';

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
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data;
};

export const adminLogin = async (data: URLSearchParams) => {
  const res = await apiClient.post('/auth/admin-login', data, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data;
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

export const register = async (data: RegisterPayload) => {
  const res = await apiClient.post('/auth/register', data);
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
