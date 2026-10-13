import { DragEvent, useMemo, useState } from "react";
import { api, errorMessage, jsonOptions } from "../api";
import { Draw, DrawMode, Participant } from "../types";
import { formatDate, Status } from "./Status";

interface Props {
  participants: Participant[];
  draw: Draw | null;
  onDrawChange: (draw: Draw) => void;
}

export default function DrawPanel({ participants, draw, onDrawChange }: Props) {
  const [mode, setMode] = useState<DrawMode>("groups");
  const [groupCount, setGroupCount] = useState(3);
  const [groupSize, setGroupSize] = useState(4);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  const configuredSetting = mode === "groups" ? groupCount : groupSize;
  const setting = participants.length > 0 ? Math.min(configuredSetting, participants.length) : 1;
  const sizes = useMemo(() => {
    if (participants.length === 0 || setting < 1) return [];
    if (mode === "groups") {
      const base = Math.floor(participants.length / setting);
      const remainder = participants.length % setting;
      return Array.from({ length: setting }, (_, index) => base + (index < remainder ? 1 : 0));
    }
    const result: number[] = [];
    for (let remaining = participants.length; remaining > 0; remaining -= setting) {
      result.push(Math.min(setting, remaining));
    }
    return result;
  }, [mode, participants.length, setting]);
  const hint = useMemo(() => {
    if (participants.length === 0) return "Cadastre participantes para configurar os grupos.";
    const distribution = new Map<number, number>();
    sizes.forEach((size) => distribution.set(size, (distribution.get(size) ?? 0) + 1));
    const detail = [...distribution.entries()]
      .map(([size, amount]) => `${amount} ${amount === 1 ? "grupo" : "grupos"} com ${size} ${size === 1 ? "pessoa" : "pessoas"}`)
      .join(" e ");
    return `${sizes.length} ${sizes.length === 1 ? "grupo" : "grupos"} • ${detail}.`;
  }, [participants.length, sizes]);

  async function createDraw() {
    setBusy(true);
    setStatus("");
    setIsError(false);
    try {
      const result = await api<{ draw: Draw }>("/api/draws", jsonOptions("POST", { mode, setting }));
      setSelectedMemberId(null);
      onDrawChange(result.draw);
      setStatus("");
    } catch (error) {
      setStatus(errorMessage(error));
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function swapMembers(firstId: number, secondId: number) {
    setSelectedMemberId(null);
    if (!draw || firstId === secondId) return;
    const firstGroup = draw.groups.find((group) => group.members.some((member) => member.id === firstId));
    const secondGroup = draw.groups.find((group) => group.members.some((member) => member.id === secondId));
    if (!firstGroup || !secondGroup) {
      setStatus("Não foi possível localizar os dois participantes neste resultado.");
      setIsError(true);
      return;
    }
    if (firstGroup.id === secondGroup.id) {
      setStatus("Para trocar, escolha uma pessoa de outro grupo.");
      setIsError(true);
      return;
    }
    try {
      const result = await api<{ draw: Draw }>(
        `/api/draws/${encodeURIComponent(draw.id)}/swap`,
        jsonOptions("PATCH", { memberAId: firstId, memberBId: secondId }),
      );
      onDrawChange(result.draw);
      setStatus("Participantes trocados e alteração salva.");
      setIsError(false);
    } catch (error) {
      setStatus(errorMessage(error));
      setIsError(true);
    }
  }

  function selectMember(memberId: number, memberName: string) {
    if (selectedMemberId === null) {
      setSelectedMemberId(memberId);
      setStatus(`${memberName} selecionado. Agora selecione alguém de outro grupo.`);
      setIsError(false);
    } else {
      void swapMembers(selectedMemberId, memberId);
    }
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>, memberId: number) {
    event.preventDefault();
    const sourceId = Number(event.dataTransfer.getData("text/plain"));
    if (sourceId) void swapMembers(sourceId, memberId);
  }

  async function copyGroups() {
    if (!draw) return;
    const text = draw.groups.map((group) =>
      `${group.name} (${group.members.length}):\n${group.members.map((member) => `  • ${member.name}`).join("\n")}`,
    ).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Lista copiada para a área de transferência.");
      setIsError(false);
    } catch (error) {
      setStatus(`Não foi possível copiar. Verifique a permissão do navegador. ${errorMessage(error)}`);
      setIsError(true);
    }
  }

  return (
    <div className="layout">
      <div className="draw-column">
        <section className="card panel">
          <h2>Participantes disponíveis</h2>
          <p className="section-note">{participants.length} pessoas cadastradas</p>
          {participants.length > 0 ? (
            <ol className="roster">
              {participants.map((participant, index) => <li key={participant.id}><span>{String(index + 1).padStart(2, "0")}</span>{participant.name}</li>)}
            </ol>
          ) : <p className="table-empty">Cadastre participantes na aba Participantes para começar.</p>}
        </section>

        <section className="card panel">
          <h2>Configurar sorteio</h2>
          <p className="section-note">Escolha a quantidade de grupos ou o tamanho máximo de cada grupo.</p>
          <div className="mode-options" role="radiogroup" aria-label="Modo de divisão">
            <label className="mode-option"><input type="radio" name="mode" checked={mode === "groups"} onChange={() => setMode("groups")} />Número de grupos</label>
            <label className="mode-option"><input type="radio" name="mode" checked={mode === "size"} onChange={() => setMode("size")} />Pessoas por grupo</label>
          </div>
          <label className="field-label" htmlFor="draw-setting">{mode === "groups" ? "Quantos grupos?" : "Quantas pessoas por grupo?"}</label>
          <select
            id="draw-setting"
            value={setting}
            disabled={participants.length === 0}
            onChange={(event) => mode === "groups" ? setGroupCount(Number(event.target.value)) : setGroupSize(Number(event.target.value))}
          >
            {Array.from({ length: participants.length }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
          <p className="hint" aria-live="polite">{hint}</p>
          <button className="primary-button draw-button" type="button" disabled={participants.length === 0 || busy} onClick={() => void createDraw()}>
            {busy ? "Sorteando..." : "⤨ Sortear grupos"}
          </button>
        </section>
      </div>

      <section className="card panel results" aria-live="polite">
        <div className="results-header">
          <div>
            <h2>Resultado do sorteio</h2>
            <p className="results-subtitle">
              {draw
                ? `${draw.participantCount} participantes • ${draw.groupCount} ${draw.groupCount === 1 ? "grupo" : "grupos"} • salvo em ${formatDate(draw.createdAt)}`
                : "Os grupos sorteados aparecerão aqui."}
            </p>
          </div>
          {draw && <div className="actions">
            <button className="secondary-button" type="button" onClick={() => void copyGroups()}>Copiar lista</button>
            <button className="secondary-button" type="button" onClick={() => window.print()}>Imprimir</button>
          </div>}
        </div>
        {draw ? (
          <>
            <p className="drag-hint">Arraste uma pessoa para outra de um grupo diferente ou selecione duas pessoas com clique ou teclado.</p>
            <div className="groups">
              {draw.groups.map((group) => (
                <article className="group-card" key={group.id}>
                  <div className="group-heading"><span>{group.name}</span><small>{group.members.length} {group.members.length === 1 ? "pessoa" : "pessoas"}</small></div>
                  <ol>
                    {group.members.map((member) => (
                      <li key={member.id}>
                        <button
                          type="button"
                          className={`participant-token${selectedMemberId === member.id ? " swap-selected" : ""}`}
                          draggable
                          aria-pressed={selectedMemberId === member.id}
                          aria-label={`${member.name}, ${group.name}. Arraste para trocar de grupo ou selecione duas pessoas.`}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", String(member.id));
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                          onDrop={(event) => handleDrop(event, member.id)}
                          onClick={() => selectMember(member.id, member.name)}
                        >{member.name}</button>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state"><span className="empty-icon" aria-hidden="true">✦</span><strong>Pronto para sortear?</strong><span>Escolha a divisão e clique em “Sortear grupos”.</span></div>
        )}
        <Status message={status} error={isError} />
      </section>
    </div>
  );
}
