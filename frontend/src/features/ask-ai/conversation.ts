import axios from 'axios';
import type { AskAnswer, AskTurn } from '../../api/client';

export type Message =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; answer: AskAnswer };

export const MAX_QUESTION = 500;
const HISTORY_TURNS = 6;
const STORED_MESSAGES = 30;

const storageKey = (workflowId: string) => `ask-ai:${workflowId}`;

// sessionStorage keeps a conversation across reloads of this tab only. Any
// failure (private mode, quota, malformed data) just means starting fresh.
export const loadConversation = (workflowId: string): Message[] => {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(storageKey(workflowId)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isMessage) : [];
  } catch {
    return [];
  }
};

export const saveConversation = (workflowId: string, messages: Message[]) => {
  try {
    if (messages.length === 0) sessionStorage.removeItem(storageKey(workflowId));
    else sessionStorage.setItem(storageKey(workflowId), JSON.stringify(messages.slice(-STORED_MESSAGES)));
  } catch {
    // Storage unavailable: the conversation lives in memory only.
  }
};

const isMessage = (m: unknown): m is Message => {
  const msg = m as Partial<Message> | null;
  if (!msg || typeof msg.id !== 'string') return false;
  if (msg.role === 'user') return typeof (msg as { text?: unknown }).text === 'string';
  const answer = (msg as { answer?: Partial<AskAnswer> }).answer;
  return msg.role === 'assistant' && typeof answer?.answer === 'string' && Array.isArray(answer.citations);
};

/** The last few turns, sent back with each question (the server caps them too). */
export const toHistory = (messages: Message[]): AskTurn[] =>
  messages.slice(-HISTORY_TURNS).map((m) =>
    m.role === 'user' ? { role: 'user', content: m.text } : { role: 'assistant', content: m.answer.answer }
  );

let counter = 0;
export const nextId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

export const suggestionsFor = (query: string) => {
  const topic = query.length > 80 ? `${query.slice(0, 77)}…` : query;
  return [
    `What are the main complaints about ${topic}?`,
    `What do people like most about ${topic}?`,
    'How do opinions differ between sources?',
    'Which concerns come up most often?',
  ];
};

const SOURCE_NAMES: Record<string, string> = {
  hackernews: 'Hacker News',
  reddit: 'Reddit',
  youtube: 'YouTube',
  bluesky: 'Bluesky',
  news: 'NewsData',
  guardian: 'The Guardian',
  twitter: 'X',
};

export const sourceName = (source: string) => SOURCE_NAMES[source] ?? source;

export const sentimentTone = (label: string | null) => {
  const value = (label ?? '').toLowerCase();
  return value === 'positive' || value === 'negative' || value === 'neutral' ? value : null;
};

const detailOf = (data: unknown) => {
  const detail = (data as { detail?: unknown } | undefined)?.detail;
  return typeof detail === 'string' && detail ? detail : null;
};

/** A message a person can act on, for any failed ask. */
export const describeAskError = (err: unknown): string => {
  if (!axios.isAxiosError(err)) return 'Something went wrong. Please try again.';
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return 'That took too long to answer. Please try again in a moment.';
  }
  if (!err.response) return "Can't reach the server. Check your connection and try again.";

  const { status, data } = err.response;
  switch (status) {
    case 404:
      return 'This workflow no longer exists.';
    case 422:
      return `Please type a question of up to ${MAX_QUESTION} characters.`;
    case 429:
      return detailOf(data) ?? "You're asking quickly. Please wait a minute and try again.";
    case 400:
    case 409:
    case 503:
      return detailOf(data) ?? 'Ask AI can’t answer right now. Please try again in a minute.';
  }
  return status >= 500
    ? 'Something went wrong on our side. Please try again in a moment.'
    : 'Something went wrong. Please try again.';
};
