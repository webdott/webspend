import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, isApiError } from '../api/client.ts';
import { keys, useMe, useMeta } from '../api/hooks.ts';
import { Logo } from '../components/Logo.tsx';
import { LoadingState, Notice, errorMessage } from '../components/ui.tsx';

export function SignIn() {
  const me = useMe({ retry: false });
  const meta = useMeta();

  if (me.isPending) return <LoadingState />;
  if (me.isSuccess) return <Navigate to="/" replace />;
  if (!isApiError(me.error) || me.error.status !== 401) {
    // The server is unreachable or broken; still let the user try to sign in.
  }

  return (
    <div className="signin">
      <div className="signin__card">
        <span className="wordmark">
          <Logo size={36} />
          WebSpend
        </span>
        <p style={{ margin: 0, fontSize: 17 }}>
          A spending tracker that logs your transactions by reading your bank alert emails as they
          arrive.
        </p>
        <a
          className="btn btn--primary google-btn"
          href="/auth/google?client=web"
          onClick={(e) => {
            e.preventDefault();
            window.location.assign('/auth/google?client=web');
          }}
        >
          <GoogleMark />
          Continue with Google
        </a>
        <p className="small muted" style={{ margin: 0 }}>
          WebSpend reads the inbox you sign in with, and only messages from the banks you switch on.
          Nothing before you switch a bank on is ever read.
        </p>
        {meta.isError ? (
          <Notice kind="error">{errorMessage(meta.error)}</Notice>
        ) : meta.data?.devAuth ? (
          <DevSignIn />
        ) : null}
      </div>
    </div>
  );
}

function DevSignIn() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.devSignIn({ email: email.trim() });
      qc.setQueryData(keys.me, { user: res.user });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="dev" style={{ width: '100%' }}>
      <summary>Developer sign-in</summary>
      <form className="inline-form" style={{ marginTop: 10 }} onSubmit={submit}>
        <label className="visually-hidden" htmlFor="dev-email">
          Email
        </label>
        <input
          id="dev-email"
          className="input"
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn" disabled={busy}>
          Sign in
        </button>
      </form>
      {error ? (
        <div style={{ marginTop: 8 }}>
          <Notice kind="error">{error}</Notice>
        </div>
      ) : null}
    </details>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#fff"
        d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.7h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"
        opacity=".9"
      />
      <path
        fill="#fff"
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"
        opacity=".75"
      />
      <path fill="#fff" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z" opacity=".6" />
      <path
        fill="#fff"
        d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z"
        opacity=".85"
      />
    </svg>
  );
}
