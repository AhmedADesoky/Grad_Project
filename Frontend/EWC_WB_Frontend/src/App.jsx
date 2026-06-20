import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard';
import { ThemeProvider } from './contexts/ThemeContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { AnalyticsProvider } from './contexts/AnalyticsContext';
import { PlanProvider } from './contexts/PlanContext';
import { ToastProvider } from './contexts/ToastContext';
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
import { PDFHistory } from './components/PDFHistory';
import { PDFDetail } from './components/PDFDetail';
import AuthCallback from './components/AuthCallback';
import { ForgotPasswordPage } from './components/ForgotPasswordPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();

  // While the initial token check is running, show nothing on the root route
  // (AuthGuard handles the spinner for protected routes)
  const authPageElement = loading
    ? null
    : isAuthenticated
      ? <Navigate to="/main" replace />
      : <AuthPage />;

  return (
    <Routes>
      <Route path="/" element={authPageElement} />
      <Route path="/main"                    element={<AuthGuard><MainPage /></AuthGuard>} />
      <Route path="/dashboard"               element={<AuthGuard><Dashboard /></AuthGuard>} />
      <Route path="/exam"                    element={<AuthGuard><ExamPage /></AuthGuard>} />
      <Route path="/exam-attempt/:attemptId" element={<AuthGuard><ExamAttemptDetailsPage /></AuthGuard>} />
      <Route path="/plan"                    element={<AuthGuard><PersonalizedPlan /></AuthGuard>} />
      <Route path="/pdf-extraction"          element={<AuthGuard><PDF_Extraction /></AuthGuard>} />
      <Route path="/pdf-history"             element={<AuthGuard><PDFHistory /></AuthGuard>} />
      <Route path="/pdf-history/:analysisId" element={<AuthGuard><PDFDetail /></AuthGuard>} />
      <Route path="/chat"                    element={<AuthGuard><ChatScreen /></AuthGuard>} />
      <Route path="/profile"                 element={<AuthGuard><ProfilePage /></AuthGuard>} />
      <Route path="/change-password"         element={<AuthGuard><ChangePasswordPage /></AuthGuard>} />
      <Route path="/auth/callback"           element={<AuthCallback />} />
      <Route path="/forgot-password"         element={<ForgotPasswordPage />} />
      <Route path="/reset-password"          element={<ResetPasswordPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <ThemeProvider>
        <ToastProvider>
          <SidebarProvider>
            <AuthProvider>
              <PlanProvider>
                <AnalyticsProvider>
                  <AppRoutes />
                </AnalyticsProvider>
              </PlanProvider>
            </AuthProvider>
          </SidebarProvider>
        </ToastProvider>
      </ThemeProvider>
    </Router>
  );
}