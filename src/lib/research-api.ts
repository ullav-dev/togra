const BASE = typeof window === "undefined"
  ? (process.env.API_URL ?? "http://localhost:8085")
  : "/api";

export interface ChatSession {
  id: string;
  username: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

async function req<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`);
  return data as T;
}

export const listChatSessions = (token: string): Promise<ChatSession[]> =>
  req("/ai-sessions", token);

export const createChatSession = (token: string, title: string): Promise<ChatSession> =>
  req("/ai-sessions", token, { method: "POST", body: JSON.stringify({ title }) });

export const deleteChatSession = (token: string, id: string): Promise<void> =>
  req(`/ai-sessions/${id}`, token, { method: "DELETE" });

export const listSessionMessages = (token: string, sessionId: string): Promise<ChatMessage[]> =>
  req(`/ai-sessions/${sessionId}/messages`, token);

export const appendSessionMessage = (
  token: string,
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): Promise<ChatMessage> =>
  req(`/ai-sessions/${sessionId}/messages`, token, {
    method: "POST",
    body: JSON.stringify({ role, content }),
  });
