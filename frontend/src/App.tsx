import { KeyboardEvent, useEffect, useState } from "react";
import { api, errorMessage } from "./api";
import DatabasePanel from "./components/DatabasePanel";
import DrawPanel from "./components/DrawPanel";
import HistoryPanel from "./components/HistoryPanel";
import LoginPanel from "./components/LoginPanel";
import ParticipantsPanel from "./components/ParticipantsPanel";
import { Status } from "./components/Status";
import UserManagementPanel from "./components/UserManagementPanel";
import { Draw, Participant } from "./types";

interface User {
  id: number;
  username: string;
  role: "admin" | "user";
}

type Tab = "draw" | "participants" | "history" | "data" | "users";
const baseTabs: Array<{ id: Tab; label: string }> = [
  { id: "draw", label: "Sorteio" },
  { id: "participants", label: "Participantes" },
  { id: "history", label: "Histórico" },
  { id: "data", label: "Banco SQLite" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("draw");
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeDraw, setActiveDraw] = useState<Draw | null>(null);
  const [globalStatus, setGlobalStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const tabs = user?.role === "admin"
    ? [...baseTabs, { id: "users" as const, label: "Usuários" }]
    : baseTabs;

  useEffect(() => {
    let active = true;
    api<{ user: User }>("/api/auth/me")
      .then((session) => { if (active) setUser(session.user); })
      .catch((error: unknown) => {
        if (active && !errorMessage(error).startsWith("Faça login")) {
          setGlobalStatus(`Não foi possível conectar ao servidor. ${errorMessage(error)}`);
          setIsError(true);
        }
      })
      .finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api<{ participants: Participant[] }>("/api/participants")
      .then((data) => { if (active) setParticipants(data.participants); })
      .catch((error: unknown) => {
        if (active) {
          setGlobalStatus(errorMessage(error));
          setIsError(true);
        }
      });
    return () => { active = false; };
  }, [user]);

  async function refreshParticipants() {
    const data = await api<{ participants: Participant[] }>("/api/participants");
    setParticipants(data.participants);
  }

  async function openDraw(id: string) {
    try {
      const data = await api<{ draw: Draw }>(`/api/draws/${encodeURIComponent(id)}`);
      setActiveDraw(data.draw);
      setActiveTab("draw");
      setGlobalStatus("Resultado carregado do histórico. As trocas também serão salvas.");
      setIsError(false);
    } catch (error) {
      setGlobalStatus(errorMessage(error));
      setIsError(true);
    }
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
      setUser(null);
      setParticipants([]);
      setActiveDraw(null);
      setActiveTab("draw");
      setGlobalStatus("");
      setIsError(false);
    } catch (error) {
      setGlobalStatus(errorMessage(error));
      setIsError(true);
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex !== undefined) {
      event.preventDefault();
      setActiveTab(tabs[nextIndex].id);
      document.getElementById(`${tabs[nextIndex].id}-tab`)?.focus();
    }
  }

  if (checkingSession) return <main className="auth-page"><p>Verificando sessão...</p></main>;
  if (!user) return <LoginPanel onLogin={setUser} />;

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">Organizador de equipes</p>
        <h1>Sorteio de grupos</h1>
        <p className="intro">Cadastre participantes, importe uma lista e gere grupos aleatórios. Cada conta mantém dados independentes.</p>
        <div className="account-toolbar">
          <span>Conectado como <strong>{user.username}</strong>{user.role === "admin" ? " · administrador" : ""}</span>
          <button className="secondary-button" type="button" onClick={() => void logout()}>Sair</button>
        </div>
      </header>
      <Status message={globalStatus} error={isError} />
      <nav className="tabs" role="tablist" aria-label="Seções do aplicativo">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            className="tab-button"
            id={`${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${tab.id}-panel`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >{tab.label}</button>
        ))}
      </nav>
      <section className="tab-panel" id={`${activeTab}-panel`} role="tabpanel" aria-labelledby={`${activeTab}-tab`}>
        {activeTab === "draw" && (
          <DrawPanel participants={participants} draw={activeDraw} onDrawChange={setActiveDraw} />
        )}
        {activeTab === "participants" && (
          <ParticipantsPanel participants={participants} onRefresh={refreshParticipants} />
        )}
        {activeTab === "history" && <HistoryPanel onOpenDraw={openDraw} />}
        {activeTab === "data" && <DatabasePanel />}
        {activeTab === "users" && user.role === "admin" && <UserManagementPanel />}
      </section>
    </main>
  );
}
