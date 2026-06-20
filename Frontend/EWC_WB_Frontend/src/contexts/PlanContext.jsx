import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth, getUserId } from './AuthContext';
import { getActivePlan } from '../graphql/AIService';

const PlanContext = createContext(undefined);

const STALE_MS = 5 * 60 * 1000; // 5 minutes — don't re-fetch if data is fresh

function parseJson(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

export function PlanProvider({ children }) {
  const { user } = useAuth();
  const userId = getUserId(user);

  const [planData,   setPlanData]   = useState(null);
  const [activeMode, setActiveMode] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const lastFetchRef = useRef(0); // timestamp of last successful fetch

  const refreshPlan = useCallback(async (force = false) => {
    if (!userId) { setPlanData(null); return; }
    // Skip if data is still fresh and not forced
    if (!force && Date.now() - lastFetchRef.current < STALE_MS) return;
    setLoading(true);
    try {
      const preferred = user?.preferredPlanMode || 'monthly';
      const fallback  = preferred === 'monthly' ? 'weekly' : 'monthly';
      let raw = await getActivePlan({ User_Id: userId, Mode: preferred });
      if (!raw?.Id) raw = await getActivePlan({ User_Id: userId, Mode: fallback });
      const resolvedMode = raw?.Mode || preferred;
      setActiveMode(resolvedMode);
      setPlanData(raw?.Id ? { ...raw, Plan: parseJson(raw.Plan) || raw.Plan } : null);
      lastFetchRef.current = Date.now();
    } catch {
      // keep stale data on error
    } finally {
      setLoading(false);
    }
  }, [userId, user?.preferredPlanMode]);

  // Initial fetch when user changes
  useEffect(() => {
    lastFetchRef.current = 0;
    refreshPlan(true);
  }, [userId]);

  // Mark stale so next navigation re-fetches — but don't fetch immediately
  const invalidate = useCallback(() => {
    lastFetchRef.current = 0;
  }, []);

  // Update a single task's status in the shared plan without re-fetching
  const updateTaskStatus = useCallback((taskId, newStatus) => {
    setPlanData(prev => {
      if (!prev?.Plan) return prev;
      const plan = parseJson(prev.Plan) || prev.Plan;
      if (!plan?.plan) return prev;
      const updated = {
        ...plan,
        plan: plan.plan.map(period => ({
          ...period,
          days: (period.days || []).map(day => ({
            ...day,
            tasks: (day.tasks || []).map(t =>
              t.task_id === taskId ? { ...t, status: newStatus } : t
            ),
          })),
        })),
      };
      return { ...prev, Plan: updated };
    });
  }, []);

  return (
    <PlanContext.Provider value={{ planData, activeMode, loading, refreshPlan, invalidate, updateTaskStatus }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}
