import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  loginUser,
  logoutUser,
  refreshAccessToken,
  signUpUser,
  updateUserProfile,
} from '../graphql/UserServer';

interface User {
  id: string;
  username: string;
  email: string;
  token?: string | null;
  profileImage?: string | null;
  level: string;
  preferredPlanMode: 'weekly' | 'monthly';
  progress: {
    completed: number;
    total: number;
  };
  examScores: Array<{
    date: string;
    score: number;
    level: string;
  }>;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  isAuthenticated: boolean;
}

// Single canonical way to get the user's ID — import this everywhere
// instead of repeating the fallback chain.
export const getUserId = (user: User | null): string => user?.id ?? '';

// Decode a JWT and return its expiry timestamp (ms), or null if unreadable.
function getTokenExpiry(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUser(raw: any): User {
  return {
    id: raw?.id || raw?.Id,
    username: raw?.username || raw?.User_Name || '',
    email: raw?.email || raw?.Email || '',
    token: raw?.token || raw?.Token || null,
    profileImage: raw?.profileImage ?? raw?.Profile_Image ?? null,
    level: raw?.level || raw?.Level || 'A1',
    preferredPlanMode: (raw?.preferredPlanMode || raw?.Preferred_Plan_Mode || 'weekly') as 'weekly' | 'monthly',
    progress: {
      completed: Number(raw?.progress?.completed ?? raw?.Progress?.Completed ?? 0),
      total: Number(raw?.progress?.total ?? raw?.Progress?.Total ?? 10),
    },
    examScores: Array.isArray(raw?.examScores) ? raw.examScores : Array.isArray(raw?.Exam_Scores) ? raw.Exam_Scores : [],
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Schedule a silent proactive refresh ~60 seconds before the access token expires.
  // This means the token is always fresh while the user is on the page.
  const scheduleProactiveRefresh = (token: string | null | undefined) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const expiry = getTokenExpiry(token);
    if (!expiry) return;
    const msUntilRefresh = expiry - Date.now() - 60_000; // 60 s before expiry
    if (msUntilRefresh <= 0) return; // already expired or about to — let the 401 handler deal
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const fresh = await refreshAccessToken();
        const normalized = normalizeUser(fresh);
        setUser(normalized);
        localStorage.setItem('currentUser', JSON.stringify(normalized));
        scheduleProactiveRefresh(normalized.token); // reschedule for the new token
      } catch {
        // Refresh cookie expired — log out silently; user will see the login page
        localStorage.removeItem('currentUser');
        setUser(null);
      }
    }, Math.max(msUntilRefresh, 5_000)); // never fire in less than 5 s
  };

  useEffect(() => {
    // Restore from cache immediately so UI isn't blank
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try { setUser(JSON.parse(savedUser)); } catch { /* corrupt cache */ }
    }

    // Verify the session is still valid with the server
    refreshAccessToken()
      .then((fresh) => {
        const normalized = normalizeUser(fresh);
        setUser(normalized);
        localStorage.setItem('currentUser', JSON.stringify(normalized));
        scheduleProactiveRefresh(normalized.token);
      })
      .catch(() => {
        // No valid refresh cookie — clear stale cache and stay logged out
        localStorage.removeItem('currentUser');
        setUser(null);
      })
      .finally(() => setLoading(false));

    // Client.js broadcasts these events when it handles 401 responses.
    // We listen here so React state stays in sync without importing AuthContext
    // into Client.js (which would create a circular dependency).
    const onRefreshed = (e: CustomEvent) => {
      const normalized = normalizeUser(e.detail.user);
      setUser(normalized);
      scheduleProactiveRefresh(normalized.token);
    };
    const onLogout = () => {
      setUser(null);
      localStorage.removeItem('currentUser');
    };

    window.addEventListener('auth:refreshed', onRefreshed as EventListener);
    window.addEventListener('auth:logout',    onLogout);

    return () => {
      window.removeEventListener('auth:refreshed', onRefreshed as EventListener);
      window.removeEventListener('auth:logout',    onLogout);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const signup = async (username: string, email: string, password: string) => {
    try {
      const result = await signUpUser({
        User_Name: username,
        Email: email,
        Password: password,
      });
      // New flow: backend returns { requiresVerification, email, message }
      if (result?.requiresVerification) return result;
      // Legacy: if backend ever returns a full user directly
      const normalized = normalizeUser(result);
      setUser(normalized);
      localStorage.setItem('currentUser', JSON.stringify(normalized));
      return true;
    } catch {
      return false;
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const raw = await loginUser({ Email: email, Password: password });
      const normalized = normalizeUser(raw);
      setUser(normalized);
      localStorage.setItem('currentUser', JSON.stringify(normalized));
      scheduleProactiveRefresh(normalized.token);
      return true;
    } catch (err: any) {
      if (err?.message?.includes('EMAIL_NOT_VERIFIED')) return 'EMAIL_NOT_VERIFIED';
      return false;
    }
  };

  const loginWithUserData = (raw: any) => {
    const normalized = normalizeUser(raw);
    setUser(normalized);
    localStorage.setItem('currentUser', JSON.stringify(normalized));
    if (normalized.token) scheduleProactiveRefresh(normalized.token);
  };

  const logout = async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    try {
      await logoutUser();
    } catch {
      // ignore
    } finally {
      localStorage.removeItem('currentUser');
      setUser(null);
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!user) return;

    const raw = await updateUserProfile({
      User_Id: user.id,
      User_Name: updates.username,
      Email: updates.email,
      Profile_Image: updates.profileImage as string | null | undefined,
      Level: updates.level,
      Preferred_Plan_Mode: updates.preferredPlanMode,
      Progress_Completed: updates.progress?.completed,
      Progress_Total: updates.progress?.total,
    });

    const normalized = normalizeUser(raw);
    setUser(normalized);
    localStorage.setItem('currentUser', JSON.stringify(normalized));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        signup,
        logout,
        updateProfile,
        loginWithUserData,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}