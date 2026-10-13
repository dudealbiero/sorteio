import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import { Draw } from "../types";
import { formatDate, Status } from "./Status";

export default function HistoryPanel({ onOpenDraw }: { onOpenDraw: (id: string) => Promise<void> }) {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ draws: Draw[] }>("/api/draws")
      .then((data) => { if (active) setDraws(data.draws); })
      .catch((error: unknown) => {
        if (active) {
          setStatus(errorMessage(error));
          setIsError(true);
        }
      });
    return () => { active = false; };
  }, []);

  return (
    <section className="card panel">
      <h2>Histórico de gerações</h2>
      <p className="section-note">Resultados e alterações ficam gravados no banco SQLite deste projeto.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data e hora</th><th>Configuração</th><th>Grupos</th><th>Participantes</th><th>Ação</th></tr></thead>
          <tbody>
            {draws.map((draw) => (
              <tr key={draw.id}>
                <td>{formatDate(draw.createdAt)}</td>
                <td>{draw.mode === "groups"
                  ? `${draw.setting} ${draw.setting === 1 ? "grupo" : "grupos"}`
                  : `${draw.setting} ${draw.setting === 1 ? "pessoa" : "pessoas"} por grupo`}</td>
                <td>{draw.groupCount}</td>
                <td>{draw.participantCount}</td>
                <td><button className="secondary-button" type="button" onClick={() => void onOpenDraw(draw.id)}>Ver resultado</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {draws.length === 0 && !status && <p className="table-empty">Nenhum sorteio registrado ainda.</p>}
      </div>
      <Status message={status} error={isError} />
    </section>
  );
}
