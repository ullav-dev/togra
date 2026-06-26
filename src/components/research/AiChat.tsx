"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart } from "ai";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  listChatSessions, createChatSession, deleteChatSession,
  listSessionMessages, appendSessionMessage,
  type ChatSession,
} from "@/lib/research-api";

// ── Context formatting ────────────────────────────────────────────────────────

function formatStoryContext(
  storyTitle?: string,
  storyDescription?: string,
): string | undefined {
  if (!storyTitle) return undefined;
  const lines = [`Story: ${storyTitle}`];
  if (storyDescription) {
    const desc = storyDescription.length > 600
      ? storyDescription.slice(0, 600) + "…"
      : storyDescription;
    lines.push(`Description: ${desc}`);
  }
  return lines.join("\n");
}

function formatTaskContext(taskTitle?: string): string | undefined {
  if (!taskTitle) return undefined;
  return `Task: ${taskTitle}`;
}

function getTextFromMessage(msg: UIMessage): string {
  return msg.parts.filter(isTextUIPart).map((p) => p.text).join("");
}

// ── Prompt templates ──────────────────────────────────────────────────────────

interface TemplateCategory {
  key: string;
  icon: string;
  prompts: string[];
}

const STORY_TEMPLATE_PROMPTS = [
  "Write acceptance criteria for {storyTitle}",
  "Break {storyTitle} into concrete tasks",
  "Identify risks and unknowns in {storyTitle}",
  "Suggest story points for {storyTitle} and explain your reasoning",
  "Draft a definition of done for {storyTitle}",
];

const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    key: "Story refinement",
    icon: "📝",
    prompts: [
      "Write a well-formed user story in 'As a … I want … so that …' format",
      "What acceptance criteria should this story include?",
      "Is this story too large to complete in one sprint? How should it be split?",
      "What edge cases or error states does this story need to handle?",
      "Write a definition of done for this story",
    ],
  },
  {
    key: "Task breakdown",
    icon: "🔧",
    prompts: [
      "Break this story into a list of concrete implementation tasks",
      "What backend changes are needed for this story?",
      "What frontend changes are needed for this story?",
      "Are there any infrastructure or deployment tasks required?",
      "What testing tasks should be included?",
    ],
  },
  {
    key: "Risk & estimation",
    icon: "⚠️",
    prompts: [
      "What are the main risks and unknowns in this story?",
      "What dependencies does this story have?",
      "What could block this story from being completed?",
      "Suggest story points and justify your estimate",
      "What questions should the team clarify before starting this story?",
    ],
  },
  {
    key: "Technical design",
    icon: "🏗️",
    prompts: [
      "Suggest an approach for implementing this story",
      "What data model changes are needed?",
      "What API endpoints are required?",
      "Are there any security considerations for this story?",
      "Suggest a database migration strategy for this change",
    ],
  },
  {
    key: "Communication",
    icon: "📣",
    prompts: [
      "Write a brief stakeholder update for this story",
      "Summarise this story for a non-technical audience",
      "Draft release notes for this feature",
      "Write a QA test plan for this story",
    ],
  },
];

// ── Main component ────────────────────────────────────────────────────────────

export interface AiChatProps {
  token: string;
  storyId?: string;
  taskId?: string;
  storyTitle?: string;
  taskTitle?: string;
  storyDescription?: string;
  onSaveAsNote: (body: string) => void;
  onOpenSettings?: () => void;
}

export default function AiChat({
  token,
  storyTitle,
  taskTitle,
  storyDescription,
  onSaveAsNote,
  onOpenSettings,
}: AiChatProps) {

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const [hasSettings, setHasSettings] = useState<boolean | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const currentSessionIdRef = useRef<string | null>(null);
  const persistedCountRef = useRef(0);

  const tokenRef = useRef(token);
  const storyContextRef = useRef<string | undefined>(undefined);
  const taskContextRef = useRef<string | undefined>(undefined);

  useEffect(() => { tokenRef.current = token; }, [token]);

  useEffect(() => {
    storyContextRef.current = formatStoryContext(storyTitle, storyDescription);
  }, [storyTitle, storyDescription]);

  useEffect(() => {
    taskContextRef.current = formatTaskContext(taskTitle);
  }, [taskTitle]);

  const transport = useRef(
    new DefaultChatTransport({
      api: "/api/ai/chat",
      headers: () => ({ Authorization: `Bearer ${tokenRef.current}` }),
      body: () => ({
        storyContext: storyContextRef.current,
        taskContext: taskContextRef.current,
      }),
    }),
  ).current;

  const { messages, sendMessage, status, setMessages, error } = useChat({ transport });
  const isStreaming = status === "submitted" || status === "streaming";

  // ── Settings check ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/ai/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) { setHasSettings(false); return; }
        const data = await r.json();
        setHasSettings(!!data?.hasKey);
      })
      .catch(() => setHasSettings(false))
      .finally(() => setSettingsLoading(false));
  }, [token]);

  // ── Session management ────────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const list = await listChatSessions(token);
      setSessions(list);
    } catch { /* non-critical */ }
    finally { setSessionsLoading(false); }
  }, [token]);

  useEffect(() => {
    if (hasSettings) loadSessions();
  }, [hasSettings, loadSessions]);

  useEffect(() => {
    if (status !== "ready") return;
    const visible = messages.filter((m) => m.role !== "system");
    const unpersisted = visible.slice(persistedCountRef.current);
    if (!unpersisted.length) return;

    (async () => {
      let sid = currentSessionIdRef.current;
      if (!sid) {
        const firstUser = unpersisted.find((m) => m.role === "user");
        const title = firstUser
          ? getTextFromMessage(firstUser).slice(0, 80)
          : new Date().toLocaleDateString();
        const session = await createChatSession(token, title);
        sid = session.id;
        currentSessionIdRef.current = sid;
        setSessions((prev) => [session, ...prev]);
      }
      for (const msg of unpersisted) {
        if (msg.role === "user" || msg.role === "assistant") {
          await appendSessionMessage(token, sid!, msg.role, getTextFromMessage(msg));
        }
      }
      persistedCountRef.current = visible.length;
      loadSessions();
    })().catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleSelectSession(session: ChatSession) {
    setHistoryOpen(false);
    const msgs = await listSessionMessages(token, session.id);
    const restored: UIMessage[] = msgs.map((m) => ({
      id: crypto.randomUUID(),
      role: m.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: m.content }],
      content: m.content,
    }));
    setMessages(restored);
    currentSessionIdRef.current = session.id;
    persistedCountRef.current = restored.length;
  }

  async function handleDeleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteChatSession(token, id).catch(() => {});
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionIdRef.current === id) {
      setMessages([]);
      currentSessionIdRef.current = null;
      persistedCountRef.current = 0;
    }
  }

  function handleClearChat() {
    setMessages([]);
    currentSessionIdRef.current = null;
    persistedCountRef.current = 0;
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput("");
    await sendMessage({ text });
  }

  function handleTemplateClick(prompt: string) {
    const title = storyTitle ?? taskTitle ?? "this story";
    const filled = prompt.replace("{storyTitle}", title);
    setInput(filled);
    setTemplatesOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSaveMessage(msg: UIMessage) {
    onSaveAsNote(getTextFromMessage(msg));
  }

  function handleSaveConversation() {
    const body = visibleMessages
      .map((m) =>
        m.role === "user"
          ? `**You:** ${getTextFromMessage(m)}`
          : `**AI:** ${getTextFromMessage(m)}`,
      )
      .join("\n\n---\n\n");
    onSaveAsNote(body);
  }

  // ── Loading / unconfigured states ─────────────────────────────────────────────

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <span className="text-sm text-slate-400">Checking AI configuration…</span>
      </div>
    );
  }

  if (!hasSettings) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 py-20">
        <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-slate-700 mb-2">AI Assistant not configured</h3>
        <p className="text-sm text-slate-400 mb-5 max-w-xs">
          Add your API key in AI Settings to enable the research assistant.
        </p>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors"
          >
            Open AI Settings →
          </button>
        )}
      </div>
    );
  }

  const visibleMessages = messages.filter((m) => m.role !== "system");
  const contextLabel = taskTitle ?? storyTitle;

  // ── Full chat UI ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0 px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-700">AI Assistant</h2>
          <button
            onClick={() => { setHistoryOpen((o) => !o); if (!historyOpen) loadSessions(); }}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              historyOpen
                ? "bg-violet-100 text-violet-700 border-violet-300"
                : "text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300"
            }`}
          >
            History
          </button>
        </div>
        {visibleMessages.length > 0 && (
          <div className="flex items-center gap-3">
            <button onClick={handleClearChat} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              Clear
            </button>
            <button onClick={handleSaveConversation} className="text-xs font-medium text-violet-600 hover:text-violet-700 transition-colors">
              Save conversation
            </button>
          </div>
        )}
      </div>

      {/* Session history panel */}
      {historyOpen && (
        <div className="shrink-0 mb-3 rounded-xl border border-slate-200 bg-slate-50 max-h-44 overflow-y-auto">
          {sessionsLoading ? (
            <div className="py-3 text-xs text-slate-400 text-center">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="py-3 text-xs text-slate-400 text-center">No saved sessions</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  onClick={() => handleSelectSession(s)}
                  className="group flex items-center gap-2 px-3 py-2 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{s.title}</p>
                    <p className="text-[10px] text-slate-400">{new Date(s.updated_at).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-colors text-xs"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Context badge */}
      {contextLabel && (
        <div className="flex items-center gap-2 mb-3 shrink-0">
          <span className="inline-flex items-center gap-1.5 text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2.5 py-1 max-w-full truncate">
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="truncate">{contextLabel}</span>
          </span>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0">
        {visibleMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            {contextLabel ? (
              <>
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700 mb-1 max-w-xs truncate">Working on: {contextLabel}</p>
                <p className="text-xs text-slate-400 max-w-xs">Ask about acceptance criteria, task breakdown, risks, estimates, or technical approach.</p>
              </>
            ) : (
              <>
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <p className="text-sm text-slate-500 max-w-xs mb-4">Ask about story refinement, task breakdown, estimation, or technical design.</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "Write acceptance criteria",
                    "Break this story into tasks",
                    "Identify risks and unknowns",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-violet-50 text-slate-600 hover:text-violet-700 rounded-full transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {visibleMessages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[88%] rounded-2xl px-4 py-3 ${
                m.role === "user"
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              {m.role === "assistant" ? (
                <>
                  <div className="prose prose-sm prose-slate max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {getTextFromMessage(m)}
                    </ReactMarkdown>
                  </div>
                  <button
                    onClick={() => handleSaveMessage(m)}
                    className="mt-2 text-xs text-slate-400 hover:text-violet-600 transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" />
                    </svg>
                    Save as note
                  </button>
                </>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{getTextFromMessage(m)}</p>
              )}
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl px-4 py-3">
              <span className="flex gap-1 items-center h-5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error.message}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Templates panel */}
      {templatesOpen && (
        <div className="shrink-0 mb-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50">
          <div className="p-2 space-y-3">
            {(storyTitle ?? taskTitle) && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-1 mb-1">
                  {taskTitle ?? storyTitle}
                </p>
                <div className="space-y-0.5">
                  {STORY_TEMPLATE_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleTemplateClick(prompt)}
                      className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      {prompt.replace("{storyTitle}", taskTitle ?? storyTitle ?? "this story")}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {TEMPLATE_CATEGORIES.map((cat) => (
              <div key={cat.key}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-1 mb-1">
                  {cat.icon} {cat.key}
                </p>
                <div className="space-y-0.5">
                  {cat.prompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleTemplateClick(prompt)}
                      className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2 shrink-0">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            contextLabel
              ? `Ask about ${contextLabel}…`
              : "Ask about story refinement, tasks, risks…"
          }
          disabled={isStreaming}
          className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shrink-0"
        >
          Send
        </button>
      </form>
      <div className="flex justify-between items-center mt-1.5 shrink-0">
        <button
          onClick={() => setTemplatesOpen((o) => !o)}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5M3.75 6.75h16.5M3.75 17.25h16.5" />
          </svg>
          {templatesOpen ? "Hide prompts" : "Prompt templates"}
        </button>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="text-[10px] text-slate-300 hover:text-slate-500 transition-colors"
          >
            AI settings
          </button>
        )}
      </div>
    </div>
  );
}
