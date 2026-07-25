const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const fetchWithAuth = async (url: string, options: RequestInit = {}, token: string | null): Promise<Response> => {
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const updatedOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include'
  };

  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  return fetch(fullUrl, updatedOptions);
};