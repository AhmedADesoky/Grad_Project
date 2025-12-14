import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, BarChart3, FileText, Calendar, User, LogOut, Sun, Moon, Inbox, Book, Users, Home } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const overviewItems = [
    { path: '/main', label: 'Home', icon: Home },
    { path: '/dashboard', label: 'Dashboard', icon: BarChart3 },
    { path: '/exam', label: 'Exam', icon: FileText },
    { path: '/plan', label: 'Plan', icon: Calendar },
    { path: '/profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="fixed left-0 top-0 h-screen w-64 bg-white dark:glass-effect-dark border-r border-border/50 overflow-y-auto">
      {/* Header */}
      <div className="p-6 border-b border-border/50">
        <Link to="/main" className="flex items-center gap-3 group">
          <div className="gradient-primary p-2.5 rounded-2xl shadow-lg group-hover:shadow-primary/50 transition-all duration-300 group-hover:scale-105">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <span className="text-foreground font-semibold text-lg">Coursue</span>
        </Link>
      </div>

      {/* Overview Section */}
      <div className="p-6">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Overview</h3>
        <div className="space-y-2">
          {overviewItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 ${
                  isActive
                    ? 'gradient-primary text-white shadow-lg'
                    : 'text-foreground hover:bg-muted/50'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium text-sm">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Settings Section */}
      <div className="p-6 border-t border-border/50 mt-auto mb-8">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Settings</h3>
        <div className="space-y-2">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-muted/50 transition-all duration-300"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="font-medium text-sm">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-destructive hover:bg-destructive/10 transition-all duration-300"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium text-sm">Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}
