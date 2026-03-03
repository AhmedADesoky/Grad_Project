import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { AuthPage } from './components/AuthPage';
import { MainPage } from './components/MainPage';
import { Dashboard } from './components/Dashboard';
import { ExamPage } from './components/ExamPage';
import { PersonalizedPlan } from './components/PersonalizedPlan';
import { ProfilePage } from './components/ProfilePage';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/" />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  console.log('AppRoutes rendering, isAuthenticated:', isAuthenticated);
  return (
    <Routes>
      <Route path="/" element={isAuthenticated ? <Navigate to="/main" /> : <AuthPage />} />
      <Route path="/main" element={<ProtectedRoute><MainPage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/exam" element={<ProtectedRoute><ExamPage /></ProtectedRoute>} />
      <Route path="/plan" element={<ProtectedRoute><PersonalizedPlan /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  console.log('App component rendering');
  
  try {
    return (
      <Router>
        <ThemeProvider>
          <SidebarProvider>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </SidebarProvider>
        </ThemeProvider>
      </Router>
    );
  } catch (error) {
    console.error('App render error:', error);
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial', color: '#fff', background: '#f00' }}>
        <h1>Error loading app</h1>
        <pre>{error.toString()}</pre>
      </div>
    );
  }
}