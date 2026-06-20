import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Zap, ExternalLink } from 'lucide-react';
import { getUsage, createCheckoutSession, createPortalSession } from '../graphql/UserServer';

const TIER_COLORS = {
  free:     'text-muted-foreground',
  pro:      'text-blue-500',
  ultimate: 'text-amber-500',
};

const TIER_BADGE = {
  free:     'bg-muted text-muted-foreground',
  pro:      'bg-blue-500/10 text-blue-500 border border-blue-500/20',
  ultimate: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
};

const PRO_PRICE_ID      = import.meta.env.VITE_STRIPE_PRO_PRICE_ID;
const ULTIMATE_PRICE_ID = import.meta.env.VITE_STRIPE_ULTIMATE_PRICE_ID;

// ── Radial arc gauge ──────────────────────────────────────────────────────────
function UsageGauge({ label, used, limit, expanded, onClick }) {
  const pct   = limit > 0 ? Math.min(used / limit, 1) : 0;
  const color = pct >= 0.9 ? '#ef4444' : pct >= 0.7 ? '#f59e0b' : '#22c55e';

  const R  = 28;
  const cx = 36;
  const cy = 36;
  const circumference = 2 * Math.PI * R;
  const dash = pct * circumference;
  const gap  = circumference - dash;

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all hover:bg-muted/50
                  ${expanded ? 'bg-muted/40 ring-1 ring-primary/20' : ''}`}
    >
      <svg width="72" height="72" viewBox="0 0 72 72">
        {/* Track */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="currentColor"
          strokeWidth="5" className="text-muted/40"
          strokeDasharray={circumference} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`} />
        {/* Arc */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={color}
          strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        {/* Center text */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11"
          fontWeight="700" fill="currentColor" className="text-foreground">
          {used}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="9"
          fill="currentColor" className="text-muted-foreground">
          / {limit}
        </text>
      </svg>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
    </button>
  );
}

// ── Upgrade modal ─────────────────────────────────────────────────────────────
function UpgradeModal({ userId, onClose }) {
  const [loading, setLoading] = useState(null);

  const handleUpgrade = async (priceId) => {
    setLoading(priceId);
    try {
      const result = await createCheckoutSession({
        User_Id:     userId,
        Price_Id:    priceId,
        Success_Url: window.location.href + '?upgraded=1',
        Cancel_Url:  window.location.href,
      });
      if (result?.url) window.location.href = result.url;
    } catch (e) {
      console.error('Checkout error:', e);
    } finally {
      setLoading(null);
    }
  };

  const plans = [
    {
      name: 'Free',
      price: '$0',
      color: 'border-border',
      features: ['4 plans / month', '8 PDFs / month', '20 chat messages', '2 mode changes'],
      priceId: null,
    },
    {
      name: 'Pro',
      price: '$10/mo',
      color: 'border-blue-500',
      highlight: true,
      features: ['10 plans / month', '15 PDFs / month', '80 chat messages', '4 mode changes', 'Weekly + Monthly'],
      priceId: PRO_PRICE_ID,
    },
    {
      name: 'Ultimate',
      price: '$20/mo',
      color: 'border-amber-500',
      features: ['20 plans / month', '30 PDFs / month', '200 chat messages', '8 mode changes', 'Weekly + Monthly'],
      priceId: ULTIMATE_PRICE_ID,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
         onClick={onClose}>
      <div className="glass-md rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Upgrade Your Plan</h2>
            <p className="text-sm text-muted-foreground">Unlock more generations, extractions and chat</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">✕</button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {plans.map(plan => (
            <div key={plan.name}
                 className={`rounded-xl border-2 ${plan.color} p-4 space-y-3 ${plan.highlight ? 'shadow-lg shadow-blue-500/10' : ''}`}>
              {plan.highlight && (
                <span className="text-[10px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded-full">POPULAR</span>
              )}
              <div>
                <p className="font-bold text-foreground">{plan.name}</p>
                <p className="text-xl font-bold text-foreground">{plan.price}</p>
              </div>
              <ul className="space-y-1">
                {plan.features.map(f => (
                  <li key={f} className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <span className="text-emerald-500">✓</span> {f}
                  </li>
                ))}
              </ul>
              {plan.priceId ? (
                <button
                  onClick={() => handleUpgrade(plan.priceId)}
                  disabled={loading === plan.priceId}
                  className={`w-full py-2 rounded-lg text-xs font-semibold transition-all
                    ${plan.highlight
                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                      : 'bg-amber-500 hover:bg-amber-600 text-white'
                    } disabled:opacity-50`}
                >
                  {loading === plan.priceId ? 'Redirecting…' : `Upgrade to ${plan.name}`}
                </button>
              ) : (
                <div className="w-full py-2 rounded-lg text-xs font-semibold text-center text-muted-foreground bg-muted">
                  Current Free Plan
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function UsageDashboard({ userId }) {
  const [usage,       setUsage]       = useState(null);
  const [expanded,    setExpanded]    = useState(null);
  const [collapsed,   setCollapsed]   = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getUsage({ User_Id: userId });
      setUsage(data);
    } catch (e) {
      console.error('Usage load error:', e);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const result = await createPortalSession({ User_Id: userId, Return_Url: window.location.href });
      if (result?.url) window.location.href = result.url;
    } catch (e) {
      console.error('Portal error:', e);
    } finally {
      setPortalLoading(false);
    }
  };

  if (!usage) return null;

  const tier = usage.tier;
  const u    = usage.usage;
  const resetsAt = new Date(usage.resets_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const gauges = [
    { key: 'plans',       label: 'Plans',  ...u.plans       },
    { key: 'pdfs',        label: 'PDFs',   ...u.pdfs        },
    { key: 'chat',        label: 'Chat',   ...u.chat        },
  ];

  const detailRows = [
    { label: 'Plan generations', ...u.plans       },
    { label: 'PDF extractions',  ...u.pdfs        },
    { label: 'Chat messages',    ...u.chat        },
    { label: 'Plan adjustments', ...u.adjustments },
    { label: 'Mode changes',     ...u.mode_changes},
  ];

  return (
    <>
      <div className="glass-md rounded-2xl border border-border/40 overflow-hidden">
        {/* Header row */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Usage</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${TIER_BADGE[tier]}`}>
              {tier}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {tier === 'free' && (
              <button onClick={() => setShowUpgrade(true)}
                className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1">
                <Zap className="w-3 h-3" /> Upgrade
              </button>
            )}
            {tier !== 'free' && (
              <button onClick={handlePortal} disabled={portalLoading}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                <ExternalLink className="w-3 h-3" />
                {portalLoading ? 'Loading…' : 'Manage'}
              </button>
            )}
            <button onClick={() => setCollapsed(c => !c)}
              className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Gauges row — always visible when not collapsed */}
        {!collapsed && (
          <div className="px-4 pb-3 space-y-3">
            <div className="flex items-center justify-center gap-4">
              {gauges.map(g => (
                <UsageGauge key={g.key} label={g.label} used={g.used} limit={g.limit}
                  expanded={expanded === g.key}
                  onClick={() => setExpanded(prev => prev === g.key ? null : g.key)} />
              ))}
            </div>

            {/* Expanded detail */}
            {expanded && (
              <div className="rounded-xl bg-muted/30 border border-border/30 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
                  All limits · resets {resetsAt}
                </p>
                {detailRows.map(row => {
                  const pct = row.limit > 0 ? row.used / row.limit : 0;
                  const barColor = pct >= 0.9 ? 'bg-red-500' : pct >= 0.7 ? 'bg-amber-500' : 'bg-emerald-500';
                  return (
                    <div key={row.label} className="space-y-0.5">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="font-medium text-foreground">{row.used} / {row.limit}</span>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${barColor} transition-all`}
                          style={{ width: `${Math.min(pct * 100, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground text-center">
              Resets on {resetsAt}
            </p>
          </div>
        )}

        {/* Collapsed mini-view: just bars */}
        {collapsed && (
          <div className="px-4 pb-3 flex gap-2">
            {gauges.map(g => {
              const pct = g.limit > 0 ? g.used / g.limit : 0;
              const barColor = pct >= 0.9 ? 'bg-red-500' : pct >= 0.7 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <div key={g.key} className="flex-1 space-y-0.5">
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>{g.label}</span><span>{g.used}/{g.limit}</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${barColor} transition-all`}
                      style={{ width: `${Math.min(pct * 100, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showUpgrade && <UpgradeModal userId={userId} onClose={() => setShowUpgrade(false)} />}
    </>
  );
}
