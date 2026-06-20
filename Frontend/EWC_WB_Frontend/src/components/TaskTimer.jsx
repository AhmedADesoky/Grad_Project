// components/TaskTimer.jsx
import React, { useEffect, useState } from 'react';
import { Clock, AlertCircle } from 'lucide-react';

function formatTimer(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds || 0));
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function TaskTimer({ durationMinutes = 30, onExpire, isActive = true }) {
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (!isActive) return;
    
    const tick = () => {
      setTimeLeft(prev => {
        const newTime = prev - 1;
        if (newTime <= 0) {
          onExpire?.();
          return 0;
        }
        return newTime;
      });
    };
    
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isActive, onExpire]);

  useEffect(() => {
    setIsUrgent(timeLeft <= 5 * 60 && timeLeft > 0);
  }, [timeLeft]);

  if (!isActive) return null;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
      isUrgent 
        ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
        : 'bg-primary/10 text-primary'
    }`}>
      <Clock className="w-3.5 h-3.5" />
      <span>{formatTimer(timeLeft)}</span>
      {isUrgent && <AlertCircle className="w-3.5 h-3.5" />}
    </div>
  );
}