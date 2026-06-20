import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  FileText,
  LogOut,
  Home,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  ScanText
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { EWCLogo } from './EWCLogo';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { isCollapsed, toggleSidebar } = useSidebar();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const overviewItems = [
    { path: '/main',      label: 'Home',      icon: Home },
    { path: '/dashboard', label: 'Dashboard', icon: BarChart3 },
    { path: '/exam',      label: 'Exam',       icon: FileText },
    { path: '/pdf-extraction', label: 'PDF Analysis', icon: ScanText },
    { path: '/chat',      label: 'Chatbot',    icon: MessageSquare },
  ];

  return (
    <aside
      className={
        'fixed left-0 top-0 h-screen z-40 transition-all duration-300 ' +
        (isCollapsed ? 'w-[68px]' : 'w-60')
      }
    >
      <div className="absolute inset-0 flex flex-col glass-md border-r border-white/20 dark:border-white/8" style={{borderRadius:0}}>

        {/* ── Header ── */}
        <div className={
          'flex-shrink-0 border-b border-border/50 ' +
          (isCollapsed ? 'px-0 py-3' : 'px-4 py-3.5') + ' border-white/15 dark:border-white/8'
        }>
          {isCollapsed ? (
            /* Collapsed: logo centered, toggle below */
            <div className="flex flex-col items-center gap-2.5">
              <Link to="/main" aria-label="Go to home">
                <EWCLogo className="w-[36px] h-[36px]" />
              </Link>
              <button
                onClick={toggleSidebar}
                className="w-7 h-7 rounded-lg glass-sm text-muted-foreground hover:text-foreground hover:shadow-md transition-spring flex items-center justify-center"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            /* Expanded: logo + brand name + toggle in one row */
            <div className="flex items-center gap-3">
              <Link to="/main" aria-label="Go to home" className="flex-shrink-0">
                <EWCLogo className="w-[36px] h-[36px]" />
              </Link>

              {/* Brand text — full name as primary, tagline as secondary */}
              <Link
                to="/main"
                className="flex-1 min-w-0 group"
                aria-label="Go to home"
              >
                <p className="text-foreground font-semibold text-[13.5px] leading-tight tracking-tight truncate">
                  English Writing Coach
                </p>
                <p className="text-[10.5px] text-muted-foreground/70 leading-tight mt-0.5 truncate font-normal">
                  AI-powered learning
                </p>
              </Link>

              {/* Toggle — rounded rectangle, consistent with nav item style */}
              <button
                onClick={toggleSidebar}
                className="flex-shrink-0 w-7 h-7 rounded-lg glass-sm text-muted-foreground hover:text-foreground hover:shadow-md transition-spring flex items-center justify-center"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ── Nav items ── */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-2.5 pt-3">
          {!isCollapsed && (
            <p className="px-2.5 pb-1.5 text-[10px] uppercase tracking-[0.13em] text-muted-foreground/60 font-semibold select-none">
              Menu
            </p>
          )}

          <div className="space-y-0.5">
            {overviewItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={isCollapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'relative flex items-center rounded-xl transition-spring',
                    isCollapsed
                      ? 'justify-center w-full h-10'
                      : 'gap-3 px-3 py-2.5',
                    isActive
                      ? 'glass-sm border border-primary/20 text-primary font-medium shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/30 dark:hover:bg-white/5',
                  ].join(' ')}
                >
                  {/* Active indicator bar */}
                  {isActive && !isCollapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                  )}
                  {isActive && isCollapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                  )}

                  <Icon className="w-[17px] h-[17px] flex-shrink-0" />
                  {!isCollapsed && (
                    <span className="text-[13px] whitespace-nowrap">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── Footer / Logout ── */}
        <div className="p-2.5 border-t border-white/15 dark:border-white/8 flex-shrink-0">
          <button
            onClick={handleLogout}
            title={isCollapsed ? 'Logout' : undefined}
            className={[
              'w-full flex items-center rounded-xl transition-all duration-200',
              isCollapsed
                ? 'justify-center h-10'
                : 'gap-3 px-3 py-2.5',
              'text-muted-foreground hover:text-destructive hover:bg-destructive/8',
            ].join(' ')}
          >
            <LogOut className="w-[17px] h-[17px] flex-shrink-0" />
            {!isCollapsed && (
              <span className="text-[13px] font-medium whitespace-nowrap">Logout</span>
            )}
          </button>
        </div>

      </div>
    </aside>
  );
}