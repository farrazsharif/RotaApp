import api from '../lib/axios';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const assistantApi = {
  // Lets the UI hide the assistant entirely rather than offering a button that
  // always fails when no API key is configured on the server.
  status: () => api.get<{ configured: boolean }>('/assistant/status').then((r) => r.data),
  chat: (messages: AssistantMessage[]) =>
    api.post<{ reply: string; toolsUsed: string[] }>('/assistant/chat', { messages }).then((r) => r.data),
};
