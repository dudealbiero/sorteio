import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import { DatabaseTables } from "../types";
import { Status } from "./Status";

const tableNames: Array<[keyof DatabaseTables, string]> = [
  ["participants", "Participantes"],
  ["draws", "Sorteios"],
  ["draw_groups", "Grupos"],
  ["draw_members", "Membros dos sorteios"],
];

export default function DatabasePanel() {
  const [tables, setTables] = useState<DatabaseTables | null>(null);
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    setStatus("");
    setIsError(false);
    try {
      const data = await api<{ tables: DatabaseTables }>("/api/database");
      setTables(data.tables);
      setStatus("Dados carregados diretamente do banco SQLite.");
    } catch (error) {
      setStatus(errorMessage(error));
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return (
    <section className="card panel">
      <div className="toolbar">
        <div>
          <h2>Dados do banco SQLite</h2>
          <p className="section-note">Registros salvos em `database/sorteio.sqlite`.</p>
        </div>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => void refresh()}>
          {busy ? "Atualizando..." : "Atualizar dados"}
        </button>
      </div>
      <Status message={status} error={isError} />
      {tableNames.map(([tableName, title]) => {
        const rows = tables?.[tableName] ?? [];
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        return (
          <section key={tableName} className="database-table-section">
            <h3>{title} (`{tableName}`)</h3>
            <div className="table-wrap">
              <table className="data-table">
                {columns.length > 0 && <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>}
                <tbody>
                  {rows.map((record, index) => (
                    <tr key={String(record.id ?? index)}>
                      {columns.map((column) => (
                        <td key={column}>{record[column] === null ? "NULL" : String(record[column])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {tables && rows.length === 0 && <p className="table-empty">Nenhum registro nesta tabela.</p>}
            </div>
          </section>
        );
      })}
      <h2 className="schema-title">Estrutura e relacionamentos</h2>
      <p className="schema-note"><strong>participants:</strong> cadastro atual e nomes normalizados para evitar duplicatas.</p>
      <p className="schema-note"><strong>draws:</strong> configurações e datas dos sorteios; cada geração contém grupos e membros em tabelas relacionadas.</p>
      <p className="schema-note"><strong>draw_members:</strong> guarda cópia do nome sorteado; exclusões do cadastro mantêm o histórico com `participant_id` nulo.</p>
    </section>
  );
}
