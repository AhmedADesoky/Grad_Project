import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSidebar } from '../contexts/SidebarContext';

export function Navbar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { isCollapsed } = useSidebar();

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : 'U';

  return (
    <header
      className={`fixed top-0 right-0 z-30 h-16 bg-white dark:bg-slate-900 flex items-center justify-end px-6 gap-10 transition-all duration-300 ${isCollapsed ? 'left-20' : 'left-64'
        }`}
    >
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      {/* Divider */}
      <div className="w-px h-6 bg-border/60" />

      {/* User Info */}
      <button
        onClick={() => navigate('/profile')}
        className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-[#3b82f6] text-white flex items-center justify-center font-bold text-sm flex-shrink-0 select-none">
          {initials}
        </div>
        <div className="text-left">
          <p className="text-xs text-muted-foreground leading-none mb-1">Hello,</p>
          <p className="text-sm font-semibold text-foreground leading-none">{user?.username || 'User'}</p>
        </div>
      </button>
    </header>
  );
}