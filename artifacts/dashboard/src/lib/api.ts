const BASE = '/bot';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401 && !path.startsWith('/auth')) {
    window.location.href = '/login';
    throw new ApiError(401, 'Não autenticado');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `HTTP ${res.status}`);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// Types
export interface User { id: number; email: string; name: string }
export interface Agent {
  id: number; user_id: number; name: string; system_prompt: string;
  model: string; provider: string; enabled: boolean;
  debounce_ms: number; max_tokens: number; temperature: number;
  created_at: string; updated_at: string;
}
export interface Device {
  id: number; user_id: number; agent_id: number | null;
  name: string; phone: string | null; status: string;
  qr?: string | null; created_at: string; updated_at: string;
}
export interface Message {
  id: number; user_id: number; device_id: number | null;
  agent_id: number | null; contact_jid: string;
  direction: 'in' | 'out'; body: string | null;
  msg_type: string; created_at: string;
}
export interface Contact {
  id: number; user_id: number; jid: string;
  name: string | null; phone: string | null;
  tags: string[]; created_at: string;
}
export interface Flow {
  id: number; user_id: number; agent_id: number; name: string;
  trigger_keyword: string; trigger_mode: string; enabled: boolean;
  created_at: string;
}
export interface TrainingItem { id: number; agent_id: number; content: string; created_at: string }
