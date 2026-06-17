import React, { createContext, useContext, useEffect, useState } from 'react';
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
  login: (email: string, password: string) => Promise<boolean>;
  signup: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  isAuthenticated: boolean;
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
    progress: {
      completed: Number(raw?.progress?.completed ?? raw?.Progress?.Completed ?? 0),
      total: Number(raw?.progress?.total ?? raw?.Progress?.Total ?? 10),
    },
    examScores: Array.isArray(raw?.examScores) ? raw.examScores : Array.isArray(raw?.Exam_Scores) ? raw.Exam_Scores : [],
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }

    refreshAccessToken()
      .then((fresh) => {
        const normalized = normalizeUser(fresh);
        setUser(normalized);
        localStorage.setItem('currentUser', JSON.stringify(normalized));
      })
      .catch(() => {
        // ignore if no refresh cookie yet
      });
  }, []);

  const signup = async (username: string, email: string, password: string) => {
    try {
      const raw = await signUpUser({
        User_Name: username,
        Email: email,
        Password: password,
      });
      const normalized = normalizeUser(raw);
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
      return true;
    } catch {
      return false;
    }
  };

  const logout = async () => {
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
      Profile_Image: updates.profileImage as string | undefined,
      Level: updates.level,
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
        login,
        signup,
        logout,
        updateProfile,
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