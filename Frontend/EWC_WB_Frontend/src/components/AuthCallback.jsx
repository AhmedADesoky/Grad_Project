import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const { loginWithUserData } = useAuth();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const data = searchParams.get('data');
    const error = searchParams.get('error');

    if (error || !data) {
      navigate('/?error=oauth_failed', { replace: true });
      return;
    }

    try {
      const user = JSON.parse(atob(data.replace(/-/g, '+').replace(/_/g, '/')));
      loginWithUserData(user);
      navigate('/main', { replace: true });
    } catch {
      navigate('/?error=oauth_failed', { replace: true });
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}
