import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Navbar } from './Navbar';
import { useAuth } from '../contexts/AuthContext';
import { Send, Bot, Plus, Trash2, Edit2, MoreVertical, X } from 'lucide-react';
import { graphQLRequest } from '../graphql/Client';

const FEEDBACK_URL = import.meta.env.VITE_AI_GRAPHQL_URL;

async function analyzeText({ User_Id, Text }) {
  const query = `
    mutation AnalyzeFeedback($Text: String!, $User_Id: String, $Save_To_Database: Boolean) {
      Analyze_Feedback(Text: $Text, User_Id: $User_Id, Save_To_Database: $Save_To_Database) {
        Success
        Result {
          Corrected
          Overall_Score
          Grammar_Score
          Vocab_Score
          Punct_Score
          Detected_Issues
        }
        Error
      }
    }
  `;
  const data = await graphQLRequest({ url: FEEDBACK_URL, query, variables: { Text, User_Id, Save_To_Database: false } });
  const payload = data?.Analyze_Feedback;
  if (!payload?.Success) throw new Error(payload?.Error || 'Analysis failed');
  return payload.Result;
}

/**
 * ChatScreen — AI English writing coach chat
 *
 * FIXED: removed import of non-existent sendChatMessage.
 * Instead calls analyzeText (Feedback mutation) which exists in AIService.js
 * and returns corrected text + scores, displayed as a structured bot reply.
 */

const QUICK_PROMPTS = [
  'Correct my writing',
  'Explain this grammar',
  'Give me a writing task',
  'Score my text',
  'What level am I?',
  'Improve this sentence',
];

function formatTime(d) {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ScorePill({ label, value, color }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {label}: {value}%
    </span>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.sender === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5">
          <Bot className="w-[15px] h-[15px]" />
        </div>
      )}
      <div className="max-w-[76%] space-y-1.5">
        <div className={`px-4 py-3 rounded-2xl text-[13px] leading-relaxed ${
          isUser
            ? 'bg-primary text-white rounded-br-sm shadow-md'
            : msg.type === 'correction'
            ? 'glass-sm bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 text-foreground rounded-bl-sm'
            : 'glass-sm text-foreground rounded-bl-sm'
        }`}>
          {msg.type === 'correction' && msg.scores && (
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              <ScorePill label="Overall"  value={msg.scores.overall}  color="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" />
              <ScorePill label="Grammar"  value={msg.scores.grammar}  color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" />
              <ScorePill label="Vocab"    value={msg.scores.vocab}    color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" />
              <ScorePill label="Punct"    value={msg.scores.punct}    color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" />
            </div>
          )}
          {msg.type === 'correction' && msg.corrected ? (
            <div>
              {msg.issues?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {msg.issues.map((issue, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-medium">{issue}</span>
                  ))}
                </div>
              )}
              <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5 uppercase tracking-wider">Corrected text</p>
              <p className="text-foreground leading-relaxed">{msg.corrected}</p>
            </div>
          ) : (
            <p>{msg.text}</p>
          )}
        </div>
        <p className={`text-[10px] text-muted-foreground px-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {formatTime(msg.timestamp)}
        </p>
      </div>
    </div>
  );
}

// Build a natural AI response for non-correction prompts
function buildPromptReply(prompt) {
  const p = prompt.toLowerCase();
  if (p.includes('task'))       return "Here's a writing task for you: Write 3–4 sentences about your morning routine. Focus on using past tense correctly and varied vocabulary. Post your answer and I'll correct it!";
  if (p.includes('level'))      return "Your current CEFR level is shown in the navbar badge. To improve it, complete exams and submit writing tasks — each evaluation updates your classification. Keep going!";
  if (p.includes('grammar'))    return "I can explain any grammar rule. Just paste the sentence or structure you want explained and I'll break it down clearly with examples.";
  if (p.includes('improve'))    return "Paste the sentence you'd like to improve and I'll give you a polished version with an explanation of what changed and why.";
  if (p.includes('score'))      return "Paste any text and I'll score it across four dimensions: overall quality, grammar accuracy, vocabulary range, and punctuation. Try it!";
  return "Paste any text and I'll correct it, score it, and explain every mistake. What would you like to work on today?";
}

export function ChatScreen() {
  const { user } = useAuth();
  const textareaRef = useRef(null);
  const bottomRef   = useRef(null);

  const [chats, setChats] = useState([{
    id: '1',
    title: 'English Coach',
    messages: [{
      id: 1,
      text: "Hello! I'm your AI English writing coach. Paste any text and I'll correct it, score it across 4 dimensions, and explain every mistake. Or pick a quick action below.",
      sender: 'bot',
      timestamp: new Date(),
    }],
    updatedAt: new Date(),
  }]);
  const [activeChatId, setActiveChatId] = useState('1');
  const [inputValue,   setInputValue]   = useState('');
  const [isTyping,     setIsTyping]     = useState(false);
  const [menuOpenId,   setMenuOpenId]   = useState(null);
  const [editingId,    setEditingId]    = useState(null);
  const [editTitle,    setEditTitle]    = useState('');
  const [sidebarOpen,  setSidebarOpen]  = useState(false);

  const activeChat = chats.find(c => c.id === activeChatId) || chats[0];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeChat?.messages, isTyping]);

  // Close context menu on outside click
  useEffect(() => {
    const h = (e) => { if (!e.target.closest('.chat-menu-container')) setMenuOpenId(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const addMessage = (chatId, msg) => {
    setChats(p => p.map(c => c.id === chatId ? { ...c, messages: [...c.messages, msg], updatedAt: new Date() } : c));
  };

  const newChat = () => {
    const id = Date.now().toString();
    setChats(p => [{
      id, title: 'New conversation',
      messages: [{ id: 1, text: "Hi! Paste your text or choose a quick action.", sender: 'bot', timestamp: new Date() }],
      updatedAt: new Date(),
    }, ...p]);
    setActiveChatId(id);
    setSidebarOpen(false);
  };

  const deleteChat = (id) => {
    setChats(p => p.filter(c => c.id !== id));
    setActiveChatId(prev => prev === id ? (chats.find(c => c.id !== id)?.id || '') : prev);
    setMenuOpenId(null);
  };

  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg = { id: Date.now(), text: trimmed, sender: 'user', timestamp: new Date() };
    addMessage(activeChatId, userMsg);
    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsTyping(true);

    // Detect if user is pasting text to correct vs typing a question
    const isQuickPrompt = QUICK_PROMPTS.some(p => trimmed.toLowerCase().startsWith(p.toLowerCase().slice(0,8)));
    const looksLikeText = trimmed.split(' ').length >= 5 && !trimmed.endsWith('?');

    try {
      if (looksLikeText && !isQuickPrompt) {
        // Analyze the text using the real Feedback API
        const userId = user?.id || user?._id || user?.User_Id || '';
        const result = await analyzeText({ User_Id: userId, Text: trimmed });
        const botMsg = {
          id: Date.now() + 1,
          text: '',
          corrected: result?.corrected || result?.Corrected || 'No corrected text returned.',
          scores: {
            overall: Math.round(Number(result?.overall_score || result?.Overall_Score || 0)),
            grammar: Math.round(Number(result?.grammar_score || result?.Grammar_Score || 0)),
            vocab:   Math.round(Number(result?.vocab_score   || result?.Vocab_Score   || 0)),
            punct:   Math.round(Number(result?.punct_score   || result?.Punct_Score   || 0)),
          },
          issues: Array.isArray(result?.detected_issues || result?.Detected_Issues)
            ? (result?.detected_issues || result?.Detected_Issues)
            : [],
          sender: 'bot',
          type: 'correction',
          timestamp: new Date(),
        };
        addMessage(activeChatId, botMsg);
      } else {
        // For quick prompts / questions: reply immediately with guidance
        await new Promise(r => setTimeout(r, 600));
        const botMsg = {
          id: Date.now() + 1,
          text: buildPromptReply(trimmed),
          sender: 'bot',
          timestamp: new Date(),
        };
        addMessage(activeChatId, botMsg);
      }
    } catch (err) {
      const botMsg = {
        id: Date.now() + 1,
        text: "I couldn't process that. Please try pasting your text again.",
        sender: 'bot',
        timestamp: new Date(),
      };
      addMessage(activeChatId, botMsg);
    } finally {
      setIsTyping(false);
    }
  }, [activeChatId, user]);

  const handleKey    = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputValue); } };
  const handleInput  = (e) => {
    setInputValue(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  };

  return (
    <div className="h-screen flex flex-col page-bg">
      <Navbar />
      <div className="flex flex-1 pt-[60px] overflow-hidden">

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-20 bg-black/20 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── Chat history sidebar ──────────────────────────────────── */}
        <aside className={`flex-shrink-0 w-60 border-r border-white/20 dark:border-white/8 flex flex-col transition-all duration-200 ${sidebarOpen ? 'fixed left-0 top-[60px] bottom-0 z-30 shadow-2xl glass-lg' : 'hidden md:flex glass-md'}`} style={{borderRadius:0}}>
          <div className="px-4 py-3.5 border-b border-white/15 dark:border-white/8 flex items-center justify-between">
            <p className="text-[12px] font-semibold text-foreground tracking-wide">Conversations</p>
            <button
              onClick={newChat}
              className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity"
              aria-label="New conversation"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {chats.map(chat => (
              <div
                key={chat.id}
                onClick={() => { setActiveChatId(chat.id); setSidebarOpen(false); }}
                className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-spring ${chat.id === activeChatId ? 'glass-sm border border-primary/20 text-primary' : 'text-foreground hover:bg-white/20 dark:hover:bg-white/5'}`}
              >
                {editingId === chat.id ? (
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onBlur={() => { setChats(p => p.map(c => c.id === chat.id ? { ...c, title: editTitle || c.title } : c)); setEditingId(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 text-[12px] bg-transparent border-b border-primary outline-none"
                  />
                ) : (
                  <span className="flex-1 text-[12px] truncate leading-snug">{chat.title}</span>
                )}

                <div className="chat-menu-container flex-shrink-0 relative">
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === chat.id ? null : chat.id); }}
                    className="p-1 rounded-lg hover:bg-muted/60 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  {menuOpenId === chat.id && (
                    <div className="absolute right-0 top-full mt-1 w-28 glass-md rounded-xl shadow-lg z-20 overflow-hidden">
                      <button
                        onClick={e => { e.stopPropagation(); setEditTitle(chat.title); setEditingId(chat.id); setMenuOpenId(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-foreground hover:bg-muted/50"
                      >
                        <Edit2 className="w-3 h-3" /> Rename
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteChat(chat.id); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-destructive hover:bg-destructive/5"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main chat area ────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-transparent">

          {/* Chat header */}
          <div className="h-12 flex items-center justify-between px-4 border-b border-white/20 dark:border-white/8 flex-shrink-0 glass-md" style={{borderRadius:0}}>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(v => !v)}
                className="md:hidden p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                aria-label="Toggle sidebar"
              >
                {sidebarOpen ? <X className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </button>
              <span className="text-[13px] font-semibold text-foreground truncate">{activeChat?.title}</span>
            </div>
            <button
              onClick={newChat}
              className="md:hidden inline-flex items-center gap-1.5 text-[12px] text-primary font-medium hover:opacity-80"
            >
              <Plus className="w-3.5 h-3.5" /> New
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 bg-transparent">
            {/* Quick prompts — only shown on fresh chat */}
            {activeChat?.messages.length <= 1 && (
              <div className="mb-6">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick actions</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map(p => (
                    <button
                      key={p}
                      onClick={() => sendMessage(p)}
                      className="text-[12px] px-3.5 py-1.5 rounded-full glass-sm hover:shadow-md hover:border-primary/40 text-foreground transition-spring"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeChat?.messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex justify-start mb-4">
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center mr-2.5 flex-shrink-0">
                  <Bot className="w-[15px] h-[15px]" />
                </div>
                <div className="glass-sm rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="flex-shrink-0 px-4 sm:px-6 pb-5 pt-2 border-t border-white/20 dark:border-white/8 glass-md" style={{borderRadius:0}}>
            <div className="flex items-end gap-2.5 glass-sm rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-primary/25 transition-spring shadow-sm">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInput}
                onKeyDown={handleKey}
                placeholder="Paste text to correct, or type a question…"
                rows={1}
                className="flex-1 resize-none bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground outline-none max-h-40 leading-relaxed"
              />
              <button
                onClick={() => sendMessage(inputValue)}
                disabled={!inputValue.trim() || isTyping}
                className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 hover:opacity-90 disabled:opacity-35 transition-all"
                aria-label="Send"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
              Enter to send · Shift+Enter for new line · Paste text to get corrections + scores
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}