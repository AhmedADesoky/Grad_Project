import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Sun, Moon, Home, LayoutDashboard, FileText, CalendarCheck,
  ScanText, MessageSquare, User, Lock, LogOut, X,
} from 'lucide-react';
import { EWCLogo } from './EWCLogo';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAnalytics } from '../contexts/AnalyticsContext';

const NAV_LINKS = [
  { path: '/main',           label: 'Home',         icon: Home            },
  { path: '/dashboard',      label: 'Dashboard',    icon: LayoutDashboard },
  { path: '/exam',           label: 'Exam',         icon: FileText        },
  { path: '/plan',           label: 'My Plan',      icon: CalendarCheck   },
  { path: '/pdf-extraction', label: 'PDF Analysis', icon: ScanText        },
  { path: '/chat',           label: 'Chat',         icon: MessageSquare   },
];

const ACCOUNT_LINKS = [
  { path: '/profile',         label: 'Profile',         icon: User },
  { path: '/change-password', label: 'Change Password', icon: Lock },
];

const LEVEL_COLORS = {
  A1: { bg: 'bg-slate-100',   text: 'text-slate-600'   },
  A2: { bg: 'bg-blue-100',    text: 'text-blue-700'    },
  B1: { bg: 'bg-violet-100',  text: 'text-violet-700'  },
  B2: { bg: 'bg-purple-100',  text: 'text-purple-700'  },
  C1: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  C2: { bg: 'bg-teal-100',    text: 'text-teal-700'    },
};

function LevelBadge({ level }) {
  if (!level) return null;
  const c = LEVEL_COLORS[level] || LEVEL_COLORS.A1;
  return (
    <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[10px] font-bold tracking-wider select-none ${c.bg} ${c.text}`}>
      {level}
    </span>
  );
}

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  let latestLevel = user?.level || 'A1';
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { metrics } = useAnalytics();
    if (metrics?.latestLevel) latestLevel = metrics.latestLevel;
  } catch { /* not mounted */ }

  const [open, setOpen] = useState(false);
  const isActive = (p) => location.pathname === p;
  const initials  = user?.username ? user.username.slice(0, 2).toUpperCase() : 'U';

  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    } else {
      // Delay removing the scroll lock until the slide-out animation finishes (300 ms)
      const t = setTimeout(() => { document.body.style.overflow = ''; }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleLogout = async () => { setOpen(false); await logout(); navigate('/'); };

  /* ── shared row style ── */
  const rowBase =
    'flex items-center gap-4 px-5 py-4 rounded-2xl border transition-spring active:scale-[0.98] w-full text-left';
  const rowIdle =
    'dark:glass-sm border-slate-200/70 dark:border-white/8 hover:shadow-md';
  const rowActive =
    'dark:glass-sm border-primary/30 bg-primary/8 dark:bg-primary/15 shadow-sm';

  return (
    <>
      {/* ── TOP BAR ── */}
      <header className="fixed top-0 inset-x-0 z-40 h-[60px]">
        <div className="absolute inset-0 glass-md border-b border-white/20 dark:border-white/8" />
        <div className="relative flex items-center justify-between h-full max-w-screen-xl mx-auto px-4 sm:px-5">

          <button
            onClick={() => setOpen(v => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="w-9 h-9 flex items-center justify-center rounded-2xl glass-sm hover:shadow-md transition-spring flex-shrink-0 text-foreground active:scale-95"
          >
            {open
              ? <X className="w-[17px] h-[17px]" strokeWidth={2} />
              : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="7"  x2="21" y2="7"  />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="17" x2="17" y2="17" />
                </svg>
              )
            }
          </button>

          <Link to="/main" className="absolute left-1/2 -translate-x-1/2" aria-label="Home">
            <EWCLogo variant="navbar" />
          </Link>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={toggleTheme} title={isDark ? 'Light mode' : 'Dark mode'}
              className="w-9 h-9 flex items-center justify-center rounded-2xl glass-sm hover:shadow-md text-muted-foreground hover:text-foreground transition-spring active:scale-95">
              {isDark ? <Sun className="w-[16px] h-[16px]" /> : <Moon className="w-[16px] h-[16px]" />}
            </button>
            <LevelBadge level={latestLevel} />
            <button onClick={() => { setOpen(false); navigate('/profile'); }} aria-label="Profile"
              className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-border/50 hover:ring-primary/50 transition-all active:scale-95 duration-150 flex-shrink-0 relative bg-primary text-primary-foreground flex items-center justify-center text-[11px] font-bold">
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-primary-foreground">{initials}</span>
              {user?.profileImage && (
                <img src={user.profileImage} alt={user.username} className="absolute inset-0 w-full h-full object-cover"
                  onError={e => { e.currentTarget.style.display = 'none'; }} />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── BACKDROP (dims page behind panel) ── */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-50 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,20,0.25)' }}
      />

      {/* ── FROSTED GLASS SIDE PANEL ── */}
      <div
        aria-hidden={!open}
        className={`fixed top-0 left-0 h-full z-50 flex flex-col overflow-y-auto transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          open ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none'
        }`}
        style={{
          width: 'min(85vw, 340px)',
          background: isDark
            ? 'linear-gradient(160deg, rgba(10,14,28,0.55) 0%, rgba(13,18,38,0.52) 50%, rgba(8,12,26,0.56) 100%)'
            : 'linear-gradient(160deg, rgba(243,245,255,0.97) 0%, rgba(245,247,255,0.97) 50%, rgba(243,246,255,0.97) 100%)',
          backdropFilter: 'blur(40px) saturate(200%) brightness(1.05)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%) brightness(1.05)',
          borderRight: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(99,102,241,0.12)',
          boxShadow: isDark
            ? '4px 0 40px rgba(0,0,0,0.6), inset -1px 0 0 rgba(255,255,255,0.04)'
            : '4px 0 40px rgba(99,102,241,0.12), inset -1px 0 0 rgba(99,102,241,0.08)',
        }}
      >
        {/* subtle top accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] flex-shrink-0"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.7) 40%, rgba(139,92,246,0.5) 70%, transparent 100%)',
          }}
        />

        {/* ── Header row ── */}
        <div className="flex items-center gap-3 px-4 pt-6 pb-4 flex-shrink-0 min-w-0">
          {/* Avatar */}
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden bg-primary text-primary-foreground flex items-center justify-center font-bold text-[13px] ring-2 ring-primary/30 shadow-lg flex-shrink-0 relative">
            <span className="absolute inset-0 flex items-center justify-center font-bold text-[13px] text-primary-foreground">{initials}</span>
            {user?.profileImage && (
              <img src={user.profileImage} alt={user.username} className="absolute inset-0 w-full h-full object-cover"
                onError={e => { e.currentTarget.style.display = 'none'; }} />
            )}
          </div>
          {/* Name + email — takes all spare space, truncates */}
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-foreground leading-tight truncate">{user?.username || 'User'}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user?.email || ''}</p>
          </div>
          {/* Badge + close — never shrink */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <LevelBadge level={latestLevel} />
            <button onClick={() => setOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-xl transition-spring active:scale-95"
              style={{
                background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
                border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
              }}>
              <X className="w-[15px] h-[15px] text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="h-px mx-5 mb-5 flex-shrink-0"
          style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }} />

        {/* ── Nav + Account sections ── */}
        <div className="flex-1 px-4 pb-8 space-y-6">

          {/* ── Navigation ── */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground/55 mb-2.5 select-none px-2">
              Navigation
            </p>
            <div className="flex flex-col gap-1.5">
              {NAV_LINKS.map(({ path, label, icon: Icon }) => {
                const active = isActive(path);
                return (
                  <Link key={path} to={path}
                    className={`flex items-center gap-3.5 px-4 py-3 rounded-2xl border transition-spring active:scale-[0.98] w-full text-left ${active ? rowActive : rowIdle}`}
                    style={active ? {} : {
                      background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(248,249,255,0.92)',
                    }}
                  >
                    <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`text-[14px] font-medium flex-1 ${active ? 'text-primary' : 'text-foreground'}`}>
                      {label}
                    </span>
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* ── Account ── */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground/55 mb-2.5 select-none px-2">
              Account
            </p>
            <div className="flex flex-col gap-1.5">
              {ACCOUNT_LINKS.map(({ path, label, icon: Icon }) => {
                const active = isActive(path);
                return (
                  <Link key={path} to={path}
                    className={`flex items-center gap-3.5 px-4 py-3 rounded-2xl border transition-spring active:scale-[0.98] w-full text-left ${active ? rowActive : rowIdle}`}
                    style={active ? {} : {
                      background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(248,249,255,0.92)',
                    }}
                  >
                    <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`text-[14px] font-medium flex-1 ${active ? 'text-primary' : 'text-foreground'}`}>
                      {label}
                    </span>
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                  </Link>
                );
              })}

              {/* Theme toggle */}
              <button onClick={toggleTheme}
                className={`flex items-center gap-3.5 px-4 py-3 rounded-2xl border transition-spring active:scale-[0.98] w-full text-left ${rowIdle}`}
                style={{ background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(248,249,255,0.92)' }}
              >
                {isDark
                  ? <Sun  className="w-[18px] h-[18px] flex-shrink-0 text-muted-foreground" />
                  : <Moon className="w-[18px] h-[18px] flex-shrink-0 text-muted-foreground" />
                }
                <span className="text-[14px] font-medium text-foreground flex-1">
                  {isDark ? 'Light Mode' : 'Dark Mode'}
                </span>
              </button>

              {/* Sign Out */}
              <button onClick={handleLogout}
                className="flex items-center gap-3.5 px-4 py-3 rounded-2xl border transition-spring active:scale-[0.98] w-full text-left"
                style={{
                  background: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.05)',
                  borderColor: 'rgba(239,68,68,0.18)',
                }}
              >
                <LogOut className="w-[18px] h-[18px] flex-shrink-0 text-destructive" />
                <span className="text-[14px] font-medium text-destructive flex-1">Sign Out</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
