import React, { createContext, useContext, useState, useEffect } from 'react';

interface SidebarContextType {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  setIsCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState === 'true') {
      setIsCollapsed(true);
    }
  }, []);

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const newValue = !prev;
      localStorage.setItem('sidebarCollapsed', String(newValue));
      return newValue;
    });
  };

  return (
    <SidebarContext.Provider value={{ isCollapsed, toggleSidebar, setIsCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within SidebarProvider');
  }
  return context;
}