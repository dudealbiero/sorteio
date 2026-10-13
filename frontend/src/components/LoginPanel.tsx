import { FormEvent, useState } from "react";
import { api, errorMessage, jsonOptions } from "../api";
import { Status } from "./Status";

interface User {
  id: number;
  username: string;
  role: "admin" | "user";
}

export default function LoginPanel({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setIsError(false);
    try {
      const result = await api<{ user: User }>("/api/auth/login", jsonOptions("POST", { username, password }));
      onLogin(result.user);
    } catch (error) {
      setStatus(errorMessage(error));
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="card panel auth-card">
        <p className="eyebrow">Organizador de equipes</p>
        <h1>Acesse sua conta</h1>
        <p className="section-note">Entre para acessar seus participantes e sorteios.</p>
        <form className="auth-form" onSubmit={submit}>
          <label className="field-label" htmlFor="login-username">Usuário</label>
          <input id="login-username" type="text" autoComplete="username" required value={username}
            onChange={(event) => setUsername(event.target.value)} />
          <label className="field-label" htmlFor="login-password">Senha</label>
          <input id="login-password" type="password" autoComplete="current-password" required value={password}
            onChange={(event) => setPassword(event.target.value)} />
          <Status message={status} error={isError} />
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
        </form>
      </section>
    </main>
  );
}
