import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { getUserFeedback, getRecentClassifications, getUserExamAttempts } from '../graphql/AIService';

const AnalyticsContext = createContext(undefined);

function avg(items, key) {
  if (!items.length) return 0;
  const total = items.reduce((a, b) => a + Number(b?.[key] || 0), 0);
  return Math.round(total / items.length);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function AnalyticsProvider({ children }) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState([]);
  const [classifications, setClassifications] = useState([]);
  const [examAttempts, setExamAttempts] = useState([]);

  const refreshAnalytics = useCallback(async () => {
    if (!user?.id) {
      setFeedback([]);
      setClassifications([]);
      setExamAttempts([]);
      return;
    }

    setLoading(true);
    try {
      const [fbRes, clsRes, attemptsRes] = await Promise.allSettled([
        getUserFeedback({ User_Id: user.id, Limit: 50, Offset: 0 }),
        getRecentClassifications({ User_Id: user.id, Days: 30 }),
        getUserExamAttempts({ User_Id: user.id, Limit: 50 }),
      ]);

      setFeedback(fbRes.status === 'fulfilled' ? (fbRes.value || []) : []);
      setClassifications(clsRes.status === 'fulfilled' ? (clsRes.value || []) : []);
      setExamAttempts(attemptsRes.status === 'fulfilled' ? (attemptsRes.value || []) : []);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refreshAnalytics();
  }, [refreshAnalytics]);

  const normalizedAttempts = useMemo(() => {
    return [...examAttempts]
      .map((a) => ({
        ...a,
        Percentage: toNumber(a?.Percentage),
        Passed: Boolean(a?.Passed),
        Auto_Submitted: Boolean(a?.Auto_Submitted),
        _date: safeDate(a?.Submitted_At || a?.Created_At),
      }))
      .filter((a) => a._date)
      .sort((a, b) => a._date - b._date);
  }, [examAttempts]);

  const latestLevel = useMemo(() => {
    if (normalizedAttempts.length > 0) {
      const last = normalizedAttempts[normalizedAttempts.length - 1];
      return last?.Final_Level || last?.Level || user?.level || 'A1';
    }
    if (classifications.length > 0) {
      return classifications[0]?.Level || user?.level || 'A1';
    }
    return user?.level || 'A1';
  }, [normalizedAttempts, classifications, user?.level]);

  const metrics = useMemo(() => {
    return {
      latestLevel,
      avgOverall: normalizedAttempts.length > 0 ? avg(normalizedAttempts, 'Percentage') : avg(feedback, 'Overall_Score'),
      avgGrammar: avg(feedback, 'Grammar_Score'),
      avgVocab: avg(feedback, 'Vocab_Score'),
      avgPunct: avg(feedback, 'Punct_Score'),
      avgClassConfidence: avg(classifications, 'Confidence'),
      totalEvaluations: normalizedAttempts.length,
      totalClassifications: classifications.length,
    };
  }, [normalizedAttempts, feedback, classifications, latestLevel]);

  return (
    <AnalyticsContext.Provider
      value={{
        loading,
        feedback,
        classifications,
        examAttempts: normalizedAttempts,
        metrics,
        refreshAnalytics,
      }}
    >
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) throw new Error('useAnalytics must be used within AnalyticsProvider');
  return ctx;
}