import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepo } from '../data/RepoContext';

/** Вход magic-link'ом: без пароля, одна почта. */
export function LoginPage() {
  const repo = useRepo();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // Уже вошли (ссылка из письма) — на главную.
  useEffect(() => {
    repo.getSession().then((session) => {
      if (session) navigate('/', { replace: true });
    });
  }, [repo, navigate]);

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await repo.sendMagicLink(trimmed);
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page login">
      <h1 className="login__title">roaMark</h1>
      <p className="login__lead">твои походы и покатушки — в одном месте</p>
      {sent ? (
        <p className="login__sent">Открой письмо — ссылка войдёт в roaMark</p>
      ) : (
        <form
          className="login__form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="login-email">почта</label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          />
          <button className="btn btn--primary" type="submit" disabled={!email.trim() || busy}>
            войти
          </button>
        </form>
      )}
    </div>
  );
}
