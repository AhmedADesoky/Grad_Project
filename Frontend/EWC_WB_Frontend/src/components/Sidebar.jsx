import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, BarChart3, FileText, LogOut, Home, ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';

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
    { path: '/main', label: 'Home', icon: Home },
    { path: '/dashboard', label: 'Dashboard', icon: BarChart3 },
    { path: '/exam', label: 'Exam', icon: FileText },
    { path: '/chat', label: 'Chatbot', icon: MessageSquare },
  ];

  return (
    <div className={`fixed left-0 top-0 h-screen transition-all duration-300 z-40 ${isCollapsed ? 'w-20' : 'w-64'}`}>

      {/* Floating Collapse Button */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3.5 top-6 z-50 w-7 h-7 bg-card rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all border border-border"
        title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className="absolute inset-0 flex flex-col bg-background">
        {/* Header */}
        <div className="p-5 flex-shrink-0">
          <Link to="/main" className="flex items-center gap-3 group">
            <div className="bg-[#3b82f6] p-2.5 rounded-xl flex-shrink-0">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            {!isCollapsed && (
              <span className="text-foreground font-bold text-base tracking-tight whitespace-nowrap">English Coach</span>
            )}
          </Link>
        </div>

        {/* Nav Items */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4">
          <div className="space-y-3">
            {overviewItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={isCollapsed ? item.label : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    } ${isCollapsed ? 'justify-center' : ''}`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && (
                    <span className="font-medium text-sm whitespace-nowrap">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Bottom: Logout only */}
        <div className="p-4 flex-shrink-0">
          <button
            onClick={handleLogout}
            title={isCollapsed ? 'Logout' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-destructive hover:bg-destructive/10 transition-all duration-200 ${isCollapsed ? 'justify-center' : ''}`}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && (
              <span className="font-medium text-sm whitespace-nowrap">Logout</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
