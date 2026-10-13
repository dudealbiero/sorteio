import { FormEvent, useState } from "react";
import { api, errorMessage, jsonOptions } from "../api";
import { Participant } from "../types";
import { formatDate, Status } from "./Status";

interface Props {
  participants: Participant[];
  onRefresh: () => Promise<void>;
}

export default function ParticipantsPanel({ participants, onRefresh }: Props) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Participant | null>(null);
  const [formStatus, setFormStatus] = useState("");
  const [formError, setFormError] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [importError, setImportError] = useState(false);
  const [registryStatus, setRegistryStatus] = useState("");
  const [registryError, setRegistryError] = useState(false);
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setEditing(null);
    setName("");
    setFormStatus("");
    setFormError(false);
  }

  async function submitParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormStatus("");
    setFormError(false);
    try {
      await api(
        editing ? `/api/participants/${editing.id}` : "/api/participants",
        jsonOptions(editing ? "PUT" : "POST", { name }),
      );
      await onRefresh();
      setFormStatus(editing ? "Participante atualizado." : "Participante adicionado.");
      setFormError(false);
      setEditing(null);
      setName("");
    } catch (error) {
      setFormStatus(errorMessage(error));
      setFormError(true);
    } finally {
      setBusy(false);
    }
  }

  async function deleteParticipant(participant: Participant) {
    if (!window.confirm(`Excluir "${participant.name}" da lista? O nome será preservado nos sorteios anteriores.`)) return;
    setRegistryStatus("");
    setRegistryError(false);
    try {
      await api(`/api/participants/${participant.id}`, { method: "DELETE" });
      if (editing?.id === participant.id) resetForm();
      await onRefresh();
      setRegistryStatus(`${participant.name} foi excluído. Os resultados anteriores foram preservados.`);
    } catch (error) {
      setRegistryStatus(errorMessage(error));
      setRegistryError(true);
    }
  }

  async function importParticipants(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setImportStatus("");
    setImportError(false);
    try {
      const result = await api<{ message: string }>("/api/participants/import", {
        method: "POST",
        body: formData,
      });
      await onRefresh();
      setImportStatus(result.message);
      form.reset();
    } catch (error) {
      setImportStatus(errorMessage(error));
      setImportError(true);
    }
  }

  return (
    <section className="card panel">
      <h2>Cadastro de participantes</h2>
      <p className="section-note">Inclua, edite ou exclua pessoas. Resultados antigos mantêm os nomes originais.</p>
      <form onSubmit={submitParticipant}>
        <label className="field-label" htmlFor="participant-name">Nome do participante</label>
        <div className="form-actions">
          <input
            id="participant-name"
            type="text"
            maxLength={120}
            autoComplete="off"
            required
            placeholder="Digite um nome"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button className="primary-button" type="submit" disabled={busy}>
            {editing ? "Salvar alterações" : "Adicionar participante"}
          </button>
          {editing && <button className="secondary-button" type="button" onClick={resetForm}>Cancelar edição</button>}
        </div>
        <Status message={formStatus} error={formError} />
      </form>

      <h3>Importar arquivo</h3>
      <p className="hint-small">Aceita CSV, Excel (.xlsx) ou texto (.txt). Use uma coluna “Nome” ou a primeira coluna, um nome por linha. Duplicados são ignorados.</p>
      <form className="file-controls" onSubmit={importParticipants}>
        <input name="file" type="file" accept=".csv,.txt,.xlsx" required />
        <button className="secondary-button" type="submit">Carregar participantes</button>
      </form>
      <Status message={importStatus} error={importError} />

      <div className="toolbar">
        <h3>Lista cadastrada</h3>
        <span className="count-badge">{participants.length}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Cadastro atualizado</th><th>Ações</th></tr></thead>
          <tbody>
            {participants.map((participant) => (
              <tr key={participant.id}>
                <td>{participant.name}</td>
                <td>{formatDate(participant.updatedAt)}</td>
                <td className="participant-actions">
                  <button className="secondary-button" type="button" onClick={() => {
                    setEditing(participant);
                    setName(participant.name);
                    setFormStatus(`Editando: ${participant.name}`);
                    setFormError(false);
                  }}>Editar</button>
                  <button className="danger-button" type="button" onClick={() => void deleteParticipant(participant)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {participants.length === 0 && <p className="table-empty">Nenhum participante cadastrado.</p>}
      </div>
      <Status message={registryStatus} error={registryError} />
    </section>
  );
}
