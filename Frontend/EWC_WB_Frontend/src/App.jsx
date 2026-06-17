import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { AnalyticsProvider } from './contexts/AnalyticsContext';
import { AuthPage } from './components/AuthPage';
import { MainPage } from './components/MainPage';
import { Dashboard } from './components/Dashboard';
import { ExamPage } from './components/ExamPage';
import { PersonalizedPlan } from './components/PersonalizedPlan';
import { ProfilePage } from './components/ProfilePage';
import { ChatScreen } from './components/ChatScreen';
import { ExamAttemptDetailsPage } from './components/ExamAttemptDetailsPage';
import { ChangePasswordPage } from './components/ChangePasswordPage';
import { PDF_Extraction } from './components/PDF_Extraction';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/" />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/" element={isAuthenticated ? <Navigate to="/main" /> : <AuthPage />} />
      <Route path="/main" element={<ProtectedRoute><MainPage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/exam" element={<ProtectedRoute><ExamPage /></ProtectedRoute>} />
      <Route path="/exam-attempt/:attemptId" element={<ProtectedRoute><ExamAttemptDetailsPage /></ProtectedRoute>} />
      <Route path="/plan" element={<ProtectedRoute><PersonalizedPlan /></ProtectedRoute>} />
      <Route path="/pdf-extraction" element={<ProtectedRoute><PDF_Extraction /></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute><ChatScreen /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <ThemeProvider>
        <SidebarProvider>
          <AuthProvider>
            <AnalyticsProvider>
              <AppRoutes />
            </AnalyticsProvider>
          </AuthProvider>
        </SidebarProvider>
      </ThemeProvider>
    </Router>
  );
}