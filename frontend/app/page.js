'use client';

import { useEffect, useRef, useState } from 'react';

async function api(path, { token, ...opts } = {}) {
  const res = await fetch(`/api/${path}`, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function SignUp({ onLogin }) {
  const [step, setStep] = useState('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (step === 'email') {
        await api('auth/request-code', { method: 'POST', body: JSON.stringify({ name, email }) });
        setStep('code');
      } else {
        const { token, user } = await api('auth/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
        onLogin(token, user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h1>DevOps Chat</h1>
      {step === 'email' ? (
        <>
          <p className="muted">Sign up with your email. We&apos;ll send you a 6-digit code.</p>
          <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </>
      ) : (
        <>
          <p className="muted">Enter the code sent to <b>{email}</b></p>
          <input inputMode="numeric" maxLength={6} required placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
          <button type="button" className="link" onClick={() => setStep('email')}>Use a different email</button>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <button disabled={busy}>{busy ? 'Please wait…' : step === 'email' ? 'Send code' : 'Verify & join'}</button>
    </form>
  );
}

function Chat({ token, user, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const lastId = useRef(0);
  const bottom = useRef(null);

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const fresh = await api(`messages?after=${lastId.current}`, { token });
        if (fresh.length && !stop) {
          lastId.current = fresh[fresh.length - 1].id;
          setMessages((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
        }
      } catch (err) {
        if (err.message === 'Unauthorized') onLogout();
      }
    }
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [token, onLogout]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const body = text;
    setText('');
    const msg = await api('messages', { method: 'POST', token, body: JSON.stringify({ body }) });
    lastId.current = Math.max(lastId.current, msg.id);
    setMessages((m) => [...m, msg]);
  }

  return (
    <div className="chat">
      <header>
        <b>DevOps Chat</b>
        <span className="muted">{user.email}</span>
        <button className="link" onClick={onLogout}>Log out</button>
      </header>
      <ul>
        {messages.map((m) => (
          <li key={m.id} className={m.email === user.email ? 'mine' : ''}>
            <span className="name">{m.name}</span>
            <p>{m.body}</p>
            <time>{new Date(m.created_at).toLocaleTimeString()}</time>
          </li>
        ))}
        <div ref={bottom} />
      </ul>
      <form onSubmit={send}>
        <input placeholder="Type a message…" value={text} onChange={(e) => setText(e.target.value)} />
        <button>Send</button>
      </form>
    </div>
  );
}

export default function Home() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('chat-session'));
      if (saved?.token) setSession(saved);
    } catch {}
  }, []);

  function login(token, user) {
    const s = { token, user };
    localStorage.setItem('chat-session', JSON.stringify(s));
    setSession(s);
  }

  function logout() {
    localStorage.removeItem('chat-session');
    setSession(null);
  }

  return <main>{session ? <Chat {...session} onLogout={logout} /> : <SignUp onLogin={login} />}</main>;
}
