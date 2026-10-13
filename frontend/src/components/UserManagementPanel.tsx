import { FormEvent, useEffect, useState } from "react";
import { api, errorMessage, jsonOptions } from "../api";
import { formatDate, Status } from "./Status";

interface ManagedUser {
  id: number;
  username: string;
  role: "admin" | "user";
  createdAt: string;
}

export default function UserManagementPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const result = await api<{ users: ManagedUser[] }>("/api/users");
    setUsers(result.users);
  }

  useEffect(() => {
    let active = true;
    api<{ users: ManagedUser[] }>("/api/users")
      .then((result) => { if (active) setUsers(result.users); })
      .catch((error: unknown) => {
        if (active) {
          setStatus(errorMessage(error));
          setIsError(true);
        }
      });
    return () => { active = false; };
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setIsError(false);
    try {
      await api("/api/users", jsonOptions("POST", { username, password }));
      setUsername("");
      setPassword("");
      await refresh();
      setStatus("Usuário criado. Os dados dele ficarão separados dos demais.");
    } catch (error) {
      setStatus(errorMessage(error));
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(user: ManagedUser) {
    const newPassword = window.prompt(`Nova senha para ${user.username} (mínimo de 12 caracteres):`);
    if (newPassword === null) return;
    setStatus("");
    setIsError(false);
    try {
      await api(`/api/users/${user.id}/password`, jsonOptions("PATCH", { password: newPassword }));
      setStatus(`Senha de ${user.username} redefinida. As sessões existentes foram encerradas.`);
    } catch (error) {
      setStatus(errorMessage(error));
      setIsError(true);
    }
  }

  async function removeUser(user: ManagedUser) {
    if (!window.confirm(`Excluir a conta de ${user.username} e todos os dados associados?`)) return;
    setStatus("");
    setIsError(false);
    try {
      await api(`/api/users/${user.id}`, { method: "DELETE" });
      await refresh();
      setStatus(`A conta de ${user.username} e seus dados foram excluídos.`);
    } catch (error) {
      setStatus(errorMessage(error));
      setIsError(true);
    }
  }

  return (
    <section className="card panel">
      <h2>Gerenciar usuários</h2>
      <p className="section-note">Crie contas independentes. Cada usuário terá seus próprios participantes e sorteios.</p>
      <form className="user-create-form" onSubmit={createUser}>
        <div>
          <label className="field-label" htmlFor="new-username">Nome de usuário</label>
          <input id="new-username" type="text" autoComplete="off" minLength={3} maxLength={40} required
            pattern="[a-zA-Z0-9._-]+" value={username} onChange={(event) => setUsername(event.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="new-password">Senha inicial</label>
          <input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required
            value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Criando..." : "Criar usuário"}</button>
      </form>
      <p className="hint-small">O usuário deve ter de 3 a 40 caracteres; a senha deve ter no mínimo 12 caracteres.</p>
      <Status message={status} error={isError} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Usuário</th><th>Perfil</th><th>Criado em</th><th>Ações</th></tr></thead>
          <tbody>{users.map((user) => (
            <tr key={user.id}>
              <td>{user.username}</td>
              <td>{user.role === "admin" ? "Administrador" : "Usuário"}</td>
              <td>{formatDate(user.createdAt)}</td>
              <td className="participant-actions">
                {user.role === "user" && <>
                  <button className="secondary-button" type="button" onClick={() => void resetPassword(user)}>Redefinir senha</button>
                  <button className="danger-button" type="button" onClick={() => void removeUser(user)}>Excluir</button>
                </>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
