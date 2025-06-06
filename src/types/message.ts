
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  context_used?: boolean; // Optional field to track if context was used
}
