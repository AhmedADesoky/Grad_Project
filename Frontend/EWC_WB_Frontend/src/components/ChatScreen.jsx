import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { EWCLogo } from './EWCLogo';
import { useAuth, getUserId } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import {
  Send, Plus, Trash2, Edit2, MoreVertical, X, Paperclip, FileText,
  Home, LayoutDashboard, FileText as FileTextNav, CalendarCheck,
  ScanText, MessageSquare, LogOut, Sun, Moon,
  BookOpen, PenLine, BarChart2, TrendingUp, Sparkles, ChevronDown,
  ThumbsUp, ThumbsDown, CheckCircle2,
} from 'lucide-react';
import { checkAndIncrement, checkLimit } from '../graphql/UserServer';
import { useToast } from '../contexts/ToastContext';
import {
  getChatSessions, getChatMessages, createChatSession,
  sendChatMessage, rateChatMessage, deleteChatSession, renameChatSession,
} from '../graphql/AIService';

const NAV_LINKS = [
  { path: '/main',           label: 'Home',         icon: Home          },
  { path: '/dashboard',      label: 'Dashboard',    icon: LayoutDashboard },
  { path: '/exam',           label: 'Exam',         icon: FileTextNav   },
  { path: '/plan',           label: 'My Plan',      icon: CalendarCheck },
  { path: '/pdf-extraction', label: 'PDF Analysis', icon: ScanText      },
  { path: '/chat',           label: 'Chat',         icon: MessageSquare },
];

const LEVEL_COLORS = {
  A1: 'bg-slate-100 text-slate-600',
  A2: 'bg-blue-100 text-blue-700',
  B1: 'bg-violet-100 text-violet-700',
  B2: 'bg-purple-100 text-purple-700',
  C1: 'bg-emerald-100 text-emerald-700',
  C2: 'bg-teal-100 text-teal-700',
};

const QUICK_PROMPTS = [
  { label: 'Correct my writing',     icon: CheckCircle2 },
  { label: 'Explain this grammar',   icon: BookOpen     },
  { label: 'Give me a writing task', icon: PenLine      },
  { label: 'Score my text',          icon: BarChart2    },
  { label: 'What level am I?',       icon: TrendingUp   },
  { label: 'Improve this sentence',  icon: Sparkles     },
];

function formatTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── FormattedMessage ─────────────────────────────────────────────────────────
// Renders AI responses: bold (**text**), section headers, numbered lists,
// bullets, and plain paragraphs — without showing any markdown symbols.
function FormattedMessage({ text }) {
  if (!text) return null;

  // Render inline **bold** spans
  const renderInline = (str) => {
    const parts = str.split(/\*\*([^*\n]+)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1
        ? <strong key={i} className="font-semibold text-foreground">{part}</strong>
        : <React.Fragment key={i}>{part}</React.Fragment>
    );
  };

  const lines = text.split('\n');
  const nodes = [];
  let listItems = [];
  let listType  = null; // 'ol' | 'ul'

  const flushList = (key) => {
    if (!listItems.length) return;
    const Tag = listType === 'ol' ? 'ol' : 'ul';
    nodes.push(
      <Tag key={`list-${key}`} className="space-y-2 my-2 ml-0">
        {listItems}
      </Tag>
    );
    listItems = [];
    listType  = null;
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Empty line → paragraph break
    if (!trimmed) {
      flushList(idx);
      nodes.push(<div key={idx} className="h-1" />);
      return;
    }

    // Numbered list item: "1. …" or "1) …"
    const numMatch = trimmed.match(/^(\d+)[.)]\s+([\s\S]+)/);
    if (numMatch) {
      if (listType !== 'ol') { flushList(idx); listType = 'ol'; }
      listItems.push(
        <li key={idx} className="flex gap-3 items-start list-none">
          <span className="shrink-0 w-[22px] h-[22px] rounded-full bg-primary/12 text-primary text-[11px] font-semibold flex items-center justify-center leading-none mt-px">
            {numMatch[1]}
          </span>
          <span className="flex-1 text-[13px] leading-relaxed">{renderInline(numMatch[2])}</span>
        </li>
      );
      return;
    }

    // Bullet item: "- …" or "• …"
    const bulletMatch = trimmed.match(/^[-•]\s+([\s\S]+)/);
    if (bulletMatch) {
      if (listType !== 'ul') { flushList(idx); listType = 'ul'; }
      listItems.push(
        <li key={idx} className="flex gap-2.5 items-start list-none">
          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary/70 mt-[7px]" />
          <span className="flex-1 text-[13px] leading-relaxed">{renderInline(bulletMatch[1])}</span>
        </li>
      );
      return;
    }

    flushList(idx);

    // Standalone section header: "**Label**" or "**Label**:" on its own line
    const headerMatch = trimmed.match(/^\*\*([^*]+)\*\*\s*:?\s*$/);
    if (headerMatch) {
      const hasColon = trimmed.endsWith(':') || trimmed.endsWith(':  ');
      nodes.push(
        <p key={idx} className="font-semibold text-[13px] text-primary mt-3 mb-0.5 leading-snug">
          {headerMatch[1]}{hasColon ? ':' : ''}
        </p>
      );
      return;
    }

    // Regular paragraph
    nodes.push(
      <p key={idx} className="text-[13px] leading-relaxed">{renderInline(trimmed)}</p>
    );
  });

  flushList('end');
  return <div className="space-y-0.5">{nodes}</div>;
}

// Reusable avatar: shows profile image if set (with initials fallback on error), else initials
function UserAvatar({ user, initials, size = 32, className = '', style = {} }) {
  const fontSize = size <= 24 ? 10 : size <= 32 ? 11 : 13;
  return (
    <div
      className={`rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0 shadow-sm relative overflow-hidden ${className}`}
      style={{ width: size, height: size, fontSize, ...style }}
    >
      <span className="absolute inset-0 flex items-center justify-center font-bold text-primary-foreground" style={{ fontSize }}>{initials}</span>
      {user?.profileImage && (
        <img
          src={user.profileImage}
          alt={user?.username || 'User'}
          className="absolute inset-0 w-full h-full object-cover"
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      )}
    </div>
  );
}

// Dark-mode palette constants — softer, eye-friendly
// Page bg:  #0B1120  (~HSL 222 45% 9%)
// Surface:  #1a2236  (~HSL 222 38% 16%)  — cards, bubbles
// Elevated: #202840  (~HSL 222 35% 19%)  — sidebar, header
// Border:   rgba(120,130,180,0.18)        — subtle dividers
// Text:     #cdd5e8  — off-white, not pure white

function BotBubble({ children }) {
  const { isDark } = useTheme();
  return (
    <div
      className="rounded-[24px] rounded-bl-[8px] overflow-hidden relative"
      style={{
        background: isDark ? '#1e2740' : 'rgba(255,255,255,0.97)',
        border: isDark ? '1px solid rgba(120,130,200,0.20)' : '1px solid rgba(208,215,232,0.90)',
        borderLeft: isDark ? '3.5px solid #818cf8' : '3.5px solid var(--primary)',
        boxShadow: isDark
          ? '0 4px 20px rgba(0,0,0,0.40), 0 1px 6px rgba(100,110,200,0.12)'
          : '0 6px 24px rgba(0,0,0,0.07), 0 2px 8px rgba(99,102,241,0.07)',
      }}
    >
      <div className="relative px-5 py-4">{children}</div>
    </div>
  );
}

function FileBubble({ filename }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[18px] bg-primary/10 border border-primary/20 max-w-[240px]">
      <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-foreground truncate">{filename}</p>
        <p className="text-[10px] text-muted-foreground">PDF attached</p>
      </div>
    </div>
  );
}

function RatingBar({ messageId, userId, currentRating, onRate }) {
  const [rating, setRating]   = useState(currentRating || '');
  const [showBox, setShowBox] = useState(false);
  const [comment, setComment] = useState('');

  const handleRate = async (val) => {
    setRating(val);
    if (val === 'bad') { setShowBox(true); return; }
    await rateChatMessage({ Message_Id: messageId, User_Id: userId, Rating: val }).catch(() => {});
    onRate?.(messageId, val, '');
  };

  const submitComment = async () => {
    await rateChatMessage({ Message_Id: messageId, User_Id: userId, Rating: 'bad', Rating_Comment: comment }).catch(() => {});
    onRate?.(messageId, 'bad', comment);
    setShowBox(false);
  };

  return (
    <div>
      <div className="flex items-center gap-1 mt-1 px-1">
        <button
          onClick={() => handleRate('good')}
          className={`p-1 rounded-lg transition-colors ${rating === 'good' ? 'text-emerald-500' : 'text-muted-foreground hover:text-emerald-500'}`}
          title="Helpful"
        >
          <ThumbsUp className="w-3 h-3" />
        </button>
        <button
          onClick={() => handleRate('bad')}
          className={`p-1 rounded-lg transition-colors ${rating === 'bad' ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'}`}
          title="Not helpful"
        >
          <ThumbsDown className="w-3 h-3" />
        </button>
      </div>
      {showBox && (
        <div className="mt-1.5 flex gap-1.5 items-center">
          <input
            autoFocus
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitComment(); if (e.key === 'Escape') setShowBox(false); }}
            placeholder="What was wrong? (optional)"
            className="flex-1 text-[11px] px-2 py-1 rounded-lg border border-border/50 bg-background outline-none focus:border-primary/40"
          />
          <button onClick={submitComment} className="text-[11px] px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">Send</button>
          <button onClick={() => setShowBox(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg, userId, onRate, user, initials }) {
  const { isDark } = useTheme();
  const isUser = msg.role === 'user';
  if (msg.isNotice) {
    return (
      <div className="flex justify-center my-3">
        <span className="text-[11px] text-muted-foreground/60 italic px-3 py-1 rounded-full bg-muted/20 border border-border/20">
          {msg.content}
        </span>
      </div>
    );
  }
  return (
    <div className={`flex items-end gap-3 ${isUser ? 'justify-end' : 'justify-start'} mb-7 animate-fade-in`}>
      {/* Bot avatar — left side */}
      {!isUser && (
        <div className="shrink-0 mb-1">
          <EWCLogo variant="agent" size={32} />
        </div>
      )}

      <div className={`${isUser ? 'max-w-[68%]' : 'max-w-[80%]'} space-y-1.5`}>
        {msg._pdfFilename ? (
          <FileBubble filename={msg._pdfFilename} />
        ) : isUser ? (
          /* ── User bubble ── */
          <div
            className="relative px-4 py-2.5 rounded-full overflow-hidden"
            style={{
              background: isDark
                ? 'linear-gradient(150deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)'
                : 'linear-gradient(150deg, #5b7df8 0%, #4f63e8 40%, #6640d4 100%)',
              boxShadow: isDark
                ? '0 2px 8px rgba(37,99,235,0.25)'
                : '0 2px 8px rgba(80,96,240,0.20)',
            }}
          >
            <div className="pointer-events-none absolute inset-0 rounded-full"
              style={{ background: 'linear-gradient(140deg, rgba(255,255,255,0.12) 0%, transparent 55%)' }} />
            <p className="relative text-[13.5px] leading-relaxed whitespace-pre-wrap text-white"
              style={{ letterSpacing: '0.01em' }}>
              {msg.content}
            </p>
          </div>
        ) : (
          <BotBubble>
            <FormattedMessage text={msg.content} />
          </BotBubble>
        )}
        {/* timestamp below bubble for both sides */}
        <div className={`flex items-center px-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <p className="text-[10px] text-muted-foreground/55">{formatTime(msg.timestamp)}</p>
        </div>
        {!isUser && msg.message_id && (
          <RatingBar
            messageId={msg.message_id}
            userId={userId}
            currentRating={msg.rating}
            onRate={onRate}
          />
        )}
      </div>

      {/* User avatar — right side */}
      {isUser && (
        <div className="shrink-0 mb-1">
          <UserAvatar user={user} initials={initials} size={32} />
        </div>
      )}
    </div>
  );
}

const WELCOME_MSG = {
  message_id: '__welcome__',
  role: 'assistant',
  content: "Hello! I'm your AI English writing coach. Ask me to explain grammar, give examples, correct your writing, quiz you, or summarize a document. You can also attach a PDF.",
  timestamp: new Date().toISOString(),
};

export function ChatScreen() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const toast = useToast();

  let latestLevel = user?.level || 'A1';
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { metrics } = useAnalytics();
    if (metrics?.latestLevel) latestLevel = metrics.latestLevel;
  } catch { /* not mounted */ }

  const textareaRef  = useRef(null);
  const bottomRef    = useRef(null);
  const fileInputRef = useRef(null);
  const navRef       = useRef(null);

  const userId   = getUserId(user);
  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : 'U';
  const levelColor = LEVEL_COLORS[latestLevel] || LEVEL_COLORS.A1;

  const [navOpen,       setNavOpen]       = useState(false);
  const [sessions,      setSessions]      = useState([]);
  const [activeId,      setActiveId]      = useState(null);
  const [messages,      setMessages]      = useState([WELCOME_MSG]);
  const [inputValue,    setInputValue]    = useState('');
  const [isTyping,      setIsTyping]      = useState(false);
  const [menuOpenId,    setMenuOpenId]    = useState(null);
  const [editingId,     setEditingId]     = useState(null);
  const [editTitle,     setEditTitle]     = useState('');
  const [pendingFile,   setPendingFile]   = useState(null);  // {file, base64, name}
  const [isUploading,   setIsUploading]   = useState(false); // true while FileReader is encoding PDF
  const [loadingMsgs,   setLoadingMsgs]   = useState(false);
  const [sessionsReady, setSessionsReady] = useState(false);

  const activeSession = sessions.find(s => s.session_id === activeId);
  // Set to true when we create a new session ourselves so the message-load
  // useEffect doesn't reset messages (the new session is empty in the DB).
  const skipNextMsgLoad = useRef(false);
  // Stable ref so the message-load effect can read sessions without adding
  // sessions to its dependency array (avoids refetch on title updates).
  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  // ── Load sessions on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    getChatSessions({ User_Id: userId })
      .then(list => {
        setSessions(list || []);
        setSessionsReady(true);
        if (list?.length > 0) {
          setActiveId(list[0].session_id);
        }
      })
      .catch(() => setSessionsReady(true));
  }, [userId]);

  // ── Load messages when active session changes ────────────────────────────────
  useEffect(() => {
    if (!activeId || !userId) { setMessages([WELCOME_MSG]); return; }
    // Skip fetch when we just created this session ourselves — it's empty in
    // the DB and we're already building messages via optimistic UI.
    if (skipNextMsgLoad.current) {
      skipNextMsgLoad.current = false;
      return;
    }
    setLoadingMsgs(true);
    getChatMessages({ Session_Id: activeId, User_Id: userId })
      .then(msgs => {
        if (!msgs || msgs.length === 0) {
          setMessages([WELCOME_MSG]);
          return;
        }
        // If this session had a PDF, inject a synthetic PDF bubble before the
        // first user message so the attachment is visible in history.
        const session = sessionsRef.current.find(s => s.session_id === activeId);
        const pdfFilename = session?.pdf_filename;
        if (pdfFilename) {
          const firstUserIdx = msgs.findIndex(m => m.role === 'user');
          if (firstUserIdx !== -1) {
            const pdfBubble = {
              message_id: `__pdf__${activeId}`,
              role:       'user',
              content:    '',
              _pdfFilename: pdfFilename,
              timestamp:  msgs[firstUserIdx].timestamp,
            };
            const withPdf = [...msgs];
            withPdf.splice(firstUserIdx, 0, pdfBubble);
            setMessages(withPdf);
            return;
          }
        }
        setMessages(msgs);
      })
      .catch(() => setMessages([WELCOME_MSG]))
      .finally(() => setLoadingMsgs(false));
  }, [activeId, userId]);

  // ── Scroll to bottom on new messages ────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
    return () => clearTimeout(t);
  }, [messages, isTyping]);

  // ── Close dropdowns on outside click ────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (!e.target.closest('.chat-menu-container')) setMenuOpenId(null);
      if (navRef.current && !navRef.current.contains(e.target)) setNavOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── New chat ─────────────────────────────────────────────────────────────────
  const newChat = async () => {
    try {
      const res = await createChatSession({ User_Id: userId });
      if (res?.session_id) {
        const newSession = {
          session_id:    res.session_id,
          title:         'New conversation',
          message_count: 0,
          created_at:    new Date().toISOString(),
          updated_at:    new Date().toISOString(),
        };
        setSessions(p => [newSession, ...p]);
        setActiveId(res.session_id);
        setMessages([WELCOME_MSG]);
      }
    } catch {
      toast.error('Could not create a new conversation.');
    }
  };

  // ── Delete session ───────────────────────────────────────────────────────────
  const handleDelete = async (sessionId) => {
    setMenuOpenId(null);
    try {
      await deleteChatSession({ Session_Id: sessionId, User_Id: userId });
    } catch { /* best effort */ }
    setSessions(p => {
      const remaining = p.filter(s => s.session_id !== sessionId);
      if (activeId === sessionId) {
        setActiveId(remaining[0]?.session_id || null);
      }
      return remaining;
    });
  };

  // ── Rename session ───────────────────────────────────────────────────────────
  const commitRename = async (sessionId) => {
    const newTitle = editTitle.trim();
    setEditingId(null);
    if (!newTitle) return;
    setSessions(p => p.map(s => s.session_id === sessionId ? { ...s, title: newTitle } : s));
    try {
      await renameChatSession({ Session_Id: sessionId, User_Id: userId, New_Title: newTitle });
    } catch { /* best effort */ }
  };

  // ── File select ──────────────────────────────────────────────────────────────
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPendingFile({ file, base64: ev.target.result, name: file.name });
      setIsUploading(false);
    };
    reader.onerror = () => {
      toast.error('Could not read the file. Please try again.');
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ── Handle rating update in message list ────────────────────────────────────
  const handleRate = (messageId, rating, comment) => {
    setMessages(p => p.map(m =>
      m.message_id === messageId ? { ...m, rating, rating_comment: comment } : m
    ));
  };

  // ── Send message ──────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed && !pendingFile) return;

    // Ensure we have a session
    let sessionId = activeId;
    if (!sessionId) {
      try {
        const res = await createChatSession({ User_Id: userId });
        if (!res?.session_id) throw new Error(res?.error || 'no session');
        sessionId = res.session_id;
        const newSess = {
          session_id:    sessionId,
          title:         'New conversation',
          message_count: 0,
          created_at:    new Date().toISOString(),
          updated_at:    new Date().toISOString(),
        };
        setSessions(p => [newSess, ...p]);
        skipNextMsgLoad.current = true;
        setActiveId(sessionId);
      } catch (err) {
        toast.error(err?.message && err.message !== 'no session'
          ? `Could not start a conversation: ${err.message}`
          : 'Could not start a conversation.');
        return;
      }
    }

    // Chat limit check
    const chatLimit = await checkLimit({ User_Id: userId, Counter: 'chat' }).catch(() => null);
    if (chatLimit && !chatLimit.allowed) {
      toast.error(`Chat limit reached (${chatLimit.used}/${chatLimit.limit}). Upgrade to send more.`);
      return;
    }

    // Optimistic UI — user message
    const optimisticUserMsg = {
      message_id: `opt-${Date.now()}`,
      role:       'user',
      content:    trimmed || (pendingFile ? `[Attached: ${pendingFile.name}]` : ''),
      timestamp:  new Date().toISOString(),
      _pdfFilename: pendingFile ? pendingFile.name : undefined,
    };
    setMessages(p => [...p, optimisticUserMsg]);
    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsTyping(true);

    const pdf64   = pendingFile?.base64 || undefined;
    const pdfName = pendingFile?.name   || undefined;
    setPendingFile(null);

    try {
      const result = await sendChatMessage({
        Session_Id:   sessionId,
        User_Id:      userId,
        Message:      trimmed || `Attached PDF: ${pdfName}`,
        User_Level:   latestLevel,
        Pdf_Base64:   pdf64,
        Pdf_Filename: pdfName,
      });

      await checkAndIncrement({ User_Id: userId, Counter: 'chat' }).catch(() => {});

      const aiMsg = {
        message_id: result?.message_id || `ai-${Date.now()}`,
        role:       'assistant',
        content:    result?.reply || 'Sorry, I could not generate a response.',
        intent:     result?.intent || '',
        timestamp:  new Date().toISOString(),
        rating:     '',
      };
      setMessages(p => [...p, aiMsg]);

      // Update session list (title + message count)
      setSessions(p => p.map(s => {
        if (s.session_id !== sessionId) return s;
        return {
          ...s,
          title:         result?.title || s.title,
          message_count: (s.message_count || 0) + 2,
          updated_at:    new Date().toISOString(),
        };
      }));
    } catch (err) {
      toast.error('Message failed. Please try again.');
      // Remove optimistic message on failure
      setMessages(p => p.filter(m => m.message_id !== optimisticUserMsg.message_id));
    } finally {
      setIsTyping(false);
    }
  }, [activeId, userId, pendingFile, latestLevel]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isUploading) sendMessage(inputValue);
    }
  };
  const handleInput = (e) => {
    setInputValue(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  };

  return (
    <div className="h-screen flex page-bg overflow-hidden">

      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={handleFileSelect} />

      {/* ══ SIDEBAR ══════════════════════════════════════════════════════════ */}
      <aside
        className="hidden md:flex flex-col w-60 h-full shrink-0 border-r"
        style={{
          background: isDark ? 'rgba(22,30,52,0.92)' : 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderColor: isDark ? 'rgba(120,130,200,0.18)' : 'rgba(99,102,241,0.12)',
        }}
      >
        {/* New conversation */}
        <div className="px-4 pt-5 pb-3">
          <button
            onClick={newChat}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-[13px] font-semibold transition-all shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: 'linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 80%, #7c3aed) 100%)',
              color: 'var(--primary-foreground)',
            }}
          >
            <div className="w-5 h-5 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <Plus className="w-3.5 h-3.5" />
            </div>
            New conversation
          </button>
        </div>

        {/* Section label */}
        <div className="px-5 mb-2 flex items-center gap-2">
          <div className="h-px flex-1" style={{ background: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.12)' }} />
          <p className="text-[9.5px] font-bold tracking-[0.14em] uppercase"
            style={{ color: isDark ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.55)' }}>
            History
          </p>
          <div className="h-px flex-1" style={{ background: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.12)' }} />
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1 pb-2">
          {!sessionsReady && (
            <p className="text-[11px] px-3 py-2" style={{ color: isDark ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.6)' }}>Loading…</p>
          )}
          {sessionsReady && sessions.length === 0 && (
            <p className="text-[11px] px-3 py-2" style={{ color: isDark ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.6)' }}>No conversations yet</p>
          )}
          {sessions.map(sess => {
            const isActive = sess.session_id === activeId;
            return (
              <div
                key={sess.session_id}
                onClick={() => setActiveId(sess.session_id)}
                className="group flex items-start gap-2.5 px-3 py-3 rounded-2xl cursor-pointer transition-all relative"
                style={{
                  background: isActive
                    ? isDark
                      ? '#1e2a48'
                      : 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.07) 100%)'
                    : 'transparent',
                  border: isActive
                    ? isDark ? '1px solid rgba(120,130,200,0.28)' : '1px solid rgba(99,102,241,0.20)'
                    : '1px solid transparent',
                  boxShadow: isActive
                    ? isDark ? '0 2px 10px rgba(0,0,0,0.25)' : '0 2px 10px rgba(99,102,241,0.08)'
                    : 'none',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = isDark ? '#18243d' : 'rgba(99,102,241,0.05)';
                    e.currentTarget.style.border = isDark ? '1px solid rgba(120,130,200,0.16)' : '1px solid rgba(99,102,241,0.10)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.border = '1px solid transparent';
                  }
                }}
              >
                {/* Icon pill */}
                <div
                  className="shrink-0 w-7 h-7 rounded-xl flex items-center justify-center mt-0.5"
                  style={{
                    background: isActive
                      ? isDark ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.15)'
                      : isDark ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.07)',
                  }}
                >
                  <MessageSquare
                    className="w-3.5 h-3.5"
                    style={{ color: isActive ? 'var(--primary)' : isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.65)' }}
                  />
                </div>

                {editingId === sess.session_id ? (
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onBlur={() => commitRename(sess.session_id)}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingId(null); }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 text-[12.5px] bg-transparent border-b border-primary outline-none mt-1"
                    style={{ color: 'var(--primary)' }}
                  />
                ) : (
                  <div className="flex-1 min-w-0">
                    <span
                      className="block text-[12.5px] font-semibold leading-snug"
                      style={{
                        color: isActive
                          ? '#a5b4fc'
                          : isDark ? '#c8d0e8' : 'rgba(15,23,42,0.82)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {sess.title || 'New conversation'}
                    </span>
                    {sess.message_count > 0 && (
                      <span
                        className="text-[10px] mt-0.5 block"
                        style={{ color: isDark ? 'rgba(148,163,184,0.4)' : 'rgba(100,116,139,0.5)' }}
                      >
                        {sess.message_count} messages
                      </span>
                    )}
                  </div>
                )}
                <div className="chat-menu-container shrink-0 relative">
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === sess.session_id ? null : sess.session_id); }}
                    className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    style={{ background: 'transparent' }}
                    onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.10)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <MoreVertical className="w-3 h-3" style={{ color: isDark ? 'rgba(148,163,184,0.7)' : 'rgba(100,116,139,0.7)' }} />
                  </button>
                  {menuOpenId === sess.session_id && (
                    <div
                      className="absolute right-0 top-full mt-1 w-32 rounded-xl shadow-xl z-20 overflow-hidden"
                      style={{
                        background: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.97)',
                        backdropFilter: 'blur(16px)',
                        border: isDark ? '1px solid rgba(99,102,241,0.18)' : '1px solid rgba(99,102,241,0.12)',
                        boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.12)',
                      }}
                    >
                      <button
                        onClick={e => { e.stopPropagation(); setEditTitle(sess.title || ''); setEditingId(sess.session_id); setMenuOpenId(null); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium transition-colors hover:bg-primary/8"
                        style={{ color: isDark ? 'rgba(226,232,240,0.9)' : 'rgba(30,41,59,0.85)' }}
                      >
                        <Edit2 className="w-3 h-3" /> Rename
                      </button>
                      <div className="h-px mx-2" style={{ background: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(0,0,0,0.06)' }} />
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(sess.session_id); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium transition-colors hover:bg-destructive/8 text-destructive"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3.5"
          style={{ borderTop: isDark ? '1px solid rgba(99,102,241,0.12)' : '1px solid rgba(99,102,241,0.10)' }}
        >
          <div className="flex items-center gap-2.5">
            <UserAvatar user={user} initials={initials} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold truncate" style={{ color: isDark ? 'rgba(226,232,240,0.9)' : 'rgba(15,23,42,0.9)' }}>
                {user?.username || 'User'}
              </p>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${levelColor}`}>{latestLevel}</span>
            </div>
            <button onClick={toggleTheme}
              className="p-1.5 rounded-xl transition-all"
              style={{ color: isDark ? 'rgba(148,163,184,0.7)' : 'rgba(100,116,139,0.7)' }}
              onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={async () => { await logout(); navigate('/'); }}
              className="p-1.5 rounded-xl transition-all"
              style={{ color: isDark ? 'rgba(148,163,184,0.7)' : 'rgba(100,116,139,0.7)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = isDark ? 'rgba(148,163,184,0.7)' : 'rgba(100,116,139,0.7)'; }}
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ══ MAIN CHAT AREA ═══════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{
            borderBottom: isDark ? '1px solid rgba(120,130,200,0.16)' : '1px solid rgba(99,102,241,0.11)',
            background: isDark ? 'rgba(20,27,48,0.95)' : 'rgba(255,255,255,0.48)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            position: 'relative',
            zIndex: 100,
          }}
        >

          <div ref={navRef} className="relative shrink-0">
            <button
              onClick={() => setNavOpen(v => !v)}
              className="relative flex items-center gap-1.5 group focus:outline-none"
              aria-label="Navigation menu"
            >
              <div className="relative">
                <EWCLogo variant="agent" size={36} />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0B1120] shadow-sm" />
              </div>
              <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${navOpen ? 'rotate-180' : ''}`} />
            </button>

            {navOpen && (
              <div className="absolute left-0 top-full mt-4 w-52 overflow-hidden"
                style={{
                  zIndex: 9999,
                  background: isDark ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.82)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  borderRadius: 16,
                  border: isDark ? '1px solid rgba(99,102,241,0.18)' : '1px solid rgba(99,102,241,0.12)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.16), 0 2px 8px rgba(99,102,241,0.1)',
                }}
              >
                <div className="px-4 pt-3.5 pb-2.5 border-b border-primary/8">
                  <div className="flex items-center gap-2.5">
                    <EWCLogo variant="agent" size={28} />
                    <div>
                      <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, fontWeight: 400, letterSpacing: '0.06em', color: 'var(--primary)', lineHeight: 1 }}>EWC</p>
                      <p className="text-[9px] font-medium text-muted-foreground tracking-widest uppercase leading-none mt-0.5">Writing Coach</p>
                    </div>
                  </div>
                </div>
                <div className="py-1.5 px-1.5">
                  {NAV_LINKS.map(({ path, label, icon: Icon }) => {
                    const active = location.pathname === path;
                    return (
                      <Link
                        key={path}
                        to={path}
                        onClick={() => setNavOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all
                          ${active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-primary/6'}`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-primary/15' : 'bg-primary/6'}`}>
                          <Icon className={`w-3.5 h-3.5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        {label}
                        {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                      </Link>
                    );
                  })}
                </div>
                <div className="border-t border-primary/8 px-3 py-2.5 flex items-center gap-2">
                  <UserAvatar user={user} initials={initials} size={24} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-foreground truncate">{user?.username || 'User'}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${levelColor}`}>{latestLevel}</span>
                  </div>
                  <button onClick={toggleTheme} className="p-1.5 rounded-lg hover:bg-primary/8 text-muted-foreground transition-colors" title={isDark ? 'Light mode' : 'Dark mode'}>
                    {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={async () => { setNavOpen(false); await logout(); navigate('/'); }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Sign out">
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold leading-tight truncate"
              style={{ color: isDark ? 'rgba(226,232,240,0.95)' : 'rgba(15,23,42,0.9)' }}>
              {activeSession?.title || 'New conversation'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isUploading ? (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium leading-none">Reading file…</span>
              ) : isTyping ? (
                <span className="flex items-center gap-1 text-[11px] font-medium leading-none" style={{ color: 'var(--primary)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-typing-dot" style={{ animationDelay: '0ms' }} />
                  Thinking…
                </span>
              ) : (
                <span className="text-[11px] leading-none" style={{ color: isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.65)' }}>
                  AI English writing coach
                </span>
              )}
            </div>
          </div>

          <button onClick={newChat} className="md:hidden p-2 rounded-xl hover:bg-primary/8 text-primary transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-8" style={{ paddingLeft: 'clamp(20px, 5vw, 56px)', paddingRight: 'clamp(20px, 5vw, 56px)' }}>

          {loadingMsgs && (
            <div className="flex justify-center py-12">
              <div className="flex gap-2 items-center">
                {[0,1,2].map(i => (
                  <span key={i} style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'var(--primary)', opacity:0.4, animation:'typing-dot 1.2s infinite ease-in-out', animationDelay:`${i*0.18}s` }} />
                ))}
              </div>
            </div>
          )}

          {!loadingMsgs && messages.length <= 1 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-px flex-1 bg-border/40" />
                <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest px-2">Quick actions</p>
                <div className="h-px flex-1 bg-border/40" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {QUICK_PROMPTS.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    onClick={() => sendMessage(label)}
                    className="flex items-center gap-2.5 text-[12px] px-3.5 py-3 rounded-2xl transition-all text-left backdrop-blur-sm text-left"
                    style={{
                      background: isDark ? 'rgba(14,20,40,0.75)' : 'rgba(255,255,255,0.85)',
                      border: isDark ? '1px solid rgba(99,102,241,0.14)' : '1px solid rgba(210,218,235,0.8)',
                      color: isDark ? 'rgba(226,232,240,0.85)' : 'rgba(15,23,42,0.80)',
                      boxShadow: isDark ? '0 2px 10px rgba(0,0,0,0.18)' : '0 2px 8px rgba(0,0,0,0.05)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.border = '1px solid rgba(99,102,241,0.38)';
                      e.currentTarget.style.background = isDark ? 'rgba(99,102,241,0.14)' : 'rgba(99,102,241,0.07)';
                      e.currentTarget.style.boxShadow = isDark ? '0 4px 16px rgba(99,102,241,0.15)' : '0 4px 14px rgba(99,102,241,0.10)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.border = isDark ? '1px solid rgba(99,102,241,0.14)' : '1px solid rgba(210,218,235,0.8)';
                      e.currentTarget.style.background = isDark ? 'rgba(14,20,40,0.75)' : 'rgba(255,255,255,0.85)';
                      e.currentTarget.style.boxShadow = isDark ? '0 2px 10px rgba(0,0,0,0.18)' : '0 2px 8px rgba(0,0,0,0.05)';
                    }}
                  >
                    <span className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.10)' }}>
                      <Icon className="w-3.5 h-3.5 text-primary" />
                    </span>
                    <span className="font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loadingMsgs && messages.map(msg => (
            <MessageBubble
              key={msg.message_id || msg.timestamp}
              msg={msg}
              userId={userId}
              onRate={handleRate}
              user={user}
              initials={initials}
            />
          ))}

          {isTyping && (
            <div className="flex justify-start mb-5 animate-fade-in">
              <div className="shrink-0 mr-3 mt-1">
                <EWCLogo variant="agent" size={32} />
              </div>
              <BotBubble>
                <div className="flex items-center gap-1.5 py-0.5">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      style={{
                        display:        'inline-block',
                        width:          8,
                        height:         8,
                        borderRadius:   '50%',
                        background:     'var(--primary)',
                        opacity:        0.6,
                        animation:      'typing-dot 1.2s infinite ease-in-out',
                        animationDelay: `${i * 0.18}s`,
                      }}
                    />
                  ))}
                </div>
              </BotBubble>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="flex-shrink-0 px-5 sm:px-8 pb-6 pt-2">
          {pendingFile && (
            <div className="mb-2.5 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/8 border border-primary/20">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              <span className="text-[12px] text-foreground truncate flex-1">{pendingFile.name}</span>
              <button onClick={() => setPendingFile(null)} className="text-muted-foreground hover:text-destructive p-0.5 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {isUploading && (
            <div className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40">
              <div className="w-3 h-3 rounded-full border-2 border-amber-500 border-t-transparent animate-spin shrink-0" />
              <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">Reading file…</span>
            </div>
          )}

          <div
            className="flex items-end gap-2.5 rounded-2xl px-3 py-2.5 transition-all"
            style={{
              background: isDark ? '#1a2236' : 'rgba(255,255,255,0.92)',
              border: isDark ? '1.5px solid rgba(120,130,200,0.22)' : '1.5px solid rgba(99,102,241,0.18)',
              boxShadow: isDark
                ? '0 2px 16px rgba(0,0,0,0.30)'
                : '0 4px 20px rgba(99,102,241,0.08), 0 1px 4px rgba(0,0,0,0.04)',
            }}
          >
            <button
              onClick={() => !isUploading && fileInputRef.current?.click()}
              disabled={isUploading || !!pendingFile}
              title={pendingFile ? 'PDF already attached — send first' : 'Attach PDF'}
              className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 mb-0.5"
              style={{ color: isDark ? 'rgba(148,163,184,0.7)' : 'rgba(100,116,139,0.7)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.background = isDark ? 'rgba(99,102,241,0.14)' : 'rgba(99,102,241,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = isDark ? 'rgba(148,163,184,0.7)' : 'rgba(100,116,139,0.7)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInput}
              onKeyDown={handleKey}
              placeholder="Ask me to explain, correct, quiz, or summarize…"
              rows={1}
              className="flex-1 resize-none bg-transparent text-[13px] outline-none max-h-40 leading-relaxed py-1"
              style={{
                color: isDark ? 'rgba(226,232,240,0.92)' : 'rgba(15,23,42,0.9)',
              }}
            />
            <button
              onClick={() => sendMessage(inputValue)}
              disabled={(!inputValue.trim() && !pendingFile) || isTyping || isUploading}
              className="w-9 h-9 rounded-xl text-primary-foreground flex items-center justify-center shrink-0 transition-all shadow-md mb-0.5 disabled:opacity-25 hover:shadow-lg hover:scale-[1.04] active:scale-[0.97]"
              style={{
                background: 'linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 80%, #7c3aed) 100%)',
              }}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-[10px] mt-2 text-center"
            style={{ color: isDark ? 'rgba(148,163,184,0.38)' : 'rgba(100,116,139,0.45)' }}>
            Enter to send · Shift+Enter for new line · <Paperclip className="inline w-2.5 h-2.5 mx-0.5 -mt-0.5" /> attach PDF (once per session)
          </p>
        </div>
      </div>
    </div>
  );
}
