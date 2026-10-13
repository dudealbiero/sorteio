export function Status({ message, error = false }: { message: string; error?: boolean }) {
  return <p className={`status${error ? " error" : ""}`} role="status" aria-live="polite">{message}</p>;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}
