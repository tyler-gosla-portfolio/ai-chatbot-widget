const BASE_URL = '/api/v1';

function getToken() {
  return localStorage.getItem('admin_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    window.location.href = '/admin/';
    return;
  }

  if (!res.ok) {
    let err;
    try { err = await res.json(); } catch { err = { message: `HTTP ${res.status}` }; }
    throw new Error(err.message || 'Request failed');
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  login: (email, password) =>
    request('/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  // API Keys
  getKeys: () => request('/admin/keys'),
  createKey: (name, allowedOrigins) =>
    request('/admin/keys', { method: 'POST', body: JSON.stringify({ name, allowedOrigins }) }),
  deleteKey: (id) => request(`/admin/keys/${id}`, { method: 'DELETE' }),
  rotateKey: (id) => request(`/admin/keys/${id}/rotate`, { method: 'POST' }),

  // KB
  getDocuments: (limit = 20, offset = 0) =>
    request(`/admin/kb/documents?limit=${limit}&offset=${offset}`),
  uploadDocument: (formData) =>
    fetch(`${BASE_URL}/admin/kb/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    }).then(r => r.json()),
  getDocumentStatus: (id) => request(`/admin/kb/documents/${id}/status`),
  deleteDocument: (id) => request(`/admin/kb/documents/${id}`, { method: 'DELETE' }),
  searchKb: (query, topK = 5) =>
    request('/admin/kb/search', { method: 'POST', body: JSON.stringify({ query, topK }) }),

  // Config
  getConfig: () => request('/admin/config'),
  updateConfig: (data) =>
    request('/admin/config', { method: 'PATCH', body: JSON.stringify(data) }),
};
