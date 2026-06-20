import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function AuthGuard({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    // Save where the user was trying to go so we can redirect back after login
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return children;
}
