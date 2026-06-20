import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

const ToastContext = createContext(undefined);

const ICONS = {
  success: CheckCircle,
  error:   AlertCircle,
  warning: AlertTriangle,
  info:    Info,
};

const STYLES = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  error:   'border-red-500/30    bg-red-500/10    text-red-400',
  warning: 'border-amber-500/30  bg-amber-500/10  text-amber-400',
  info:    'border-primary/30    bg-primary/10    text-primary',
};

function ToastItem({ toast, onDismiss }) {
  const Icon = ICONS[toast.type] || Info;
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-xl text-[13px] font-medium max-w-sm w-full pointer-events-auto animate-in slide-in-from-right-4 duration-300 ${STYLES[toast.type] || STYLES.info}`}
    >
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span className="flex-1 leading-snug text-foreground">{toast.message}</span>
      <button onClick={() => onDismiss(toast.id)} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    setToasts(p => p.filter(t => t.id !== id));
  }, []);

  const toast = useCallback(({ message, type = 'info', duration = 4000 }) => {
    const id = Date.now().toString();
    setToasts(p => [...p.slice(-4), { id, message, type }]); // keep max 5
    timersRef.current[id] = setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  // Convenience helpers
  toast.success = (msg, opts) => toast({ message: msg, type: 'success', ...opts });
  toast.error   = (msg, opts) => toast({ message: msg, type: 'error',   duration: 6000, ...opts });
  toast.warning = (msg, opts) => toast({ message: msg, type: 'warning', ...opts });
  toast.info    = (msg, opts) => toast({ message: msg, type: 'info',    ...opts });

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Portal — fixed top-right corner */}
      <div className="fixed top-[70px] right-4 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
