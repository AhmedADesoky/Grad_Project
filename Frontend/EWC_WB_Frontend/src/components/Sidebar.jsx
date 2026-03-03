import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, BarChart3, FileText, Calendar, User, LogOut, Sun, Moon, Inbox, Book, Users, Home, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSidebar } from '../contexts/SidebarContext';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { isCollapsed, toggleSidebar } = useSidebar();

  useEffect(() => {
    const handleMouseMove = (e) => {
      const tooltipElements = document.querySelectorAll('[data-tooltip]');
      tooltipElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top <= e.clientY && e.clientY <= rect.bottom &&
            rect.left <= e.clientX && e.clientX <= rect.right) {
          document.documentElement.style.setProperty('--mouse-y', `${rect.top + rect.height / 2}px`);
        }
      });
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

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
    <div className={`fixed left-0 top-0 h-screen transition-all duration-300 z-40 ${isCollapsed ? 'w-20' : 'w-64'}`} style={{ overflow: 'visible' }}>
      <div className="absolute inset-0 flex flex-col">
        <div className="absolute inset-0 bg-card/80 backdrop-blur-2xl border-r border-border shadow-lg -z-10"></div>
        <div className="flex-1 overflow-y-auto" style={{ overflowX: 'hidden' }}>
      {/* Header */}
      <div className="p-6 border-b border-border/50">
        <Link to="/main" className="flex items-center gap-3 group" {...(isCollapsed && { 'data-tooltip': 'English Coach' })}>
          <div className="gradient-primary p-3 rounded-2xl shadow-lg group-hover:shadow-primary/50 transition-all duration-300 group-hover:scale-110 flex-shrink-0">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          {!isCollapsed && (
            <span className="text-foreground font-bold text-lg tracking-tight whitespace-nowrap">English Coach</span>
          )}
        </Link>
      </div>

      {/* Overview Section */}
      <div className="p-6">
        {!isCollapsed && (
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Overview</h3>
        )}
        <div className="space-y-2">
          {overviewItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  isActive
                    ? 'gradient-primary text-white shadow-lg shadow-primary/40 scale-105'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:scale-102'
                } ${isCollapsed ? 'justify-center' : ''}`}
                {...(isCollapsed && { 'data-tooltip': item.label })}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!isCollapsed && (
                  <span className="font-semibold text-sm whitespace-nowrap">{item.label}</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Settings Section */}
      <div className="p-6 border-t border-border/50 mt-auto mb-8">
        {!isCollapsed && (
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Settings</h3>
        )}
        <div className="space-y-2">
          <button
            onClick={toggleSidebar}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-300 hover:scale-102 ${isCollapsed ? 'justify-center' : ''}`}
            {...(isCollapsed && { 'data-tooltip': 'Expand Sidebar' })}
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5 flex-shrink-0" /> : <ChevronLeft className="w-5 h-5 flex-shrink-0" />}
            {!isCollapsed && (
              <span className="font-semibold text-sm whitespace-nowrap">Collapse Sidebar</span>
            )}
          </button>
          <button
            onClick={toggleTheme}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-300 hover:scale-102 ${isCollapsed ? 'justify-center' : ''}`}
            {...(isCollapsed && { 'data-tooltip': isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode' })}
          >
            {isDark ? <Sun className="w-5 h-5 flex-shrink-0" /> : <Moon className="w-5 h-5 flex-shrink-0" />}
            {!isCollapsed && (
              <span className="font-semibold text-sm whitespace-nowrap">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
            )}
          </button>
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-all duration-300 hover:scale-102 ${isCollapsed ? 'justify-center' : ''}`}
            {...(isCollapsed && { 'data-tooltip': 'Logout' })}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && (
              <span className="font-semibold text-sm whitespace-nowrap">Logout</span>
            )}
          </button>
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
