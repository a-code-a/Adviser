interface StatusPillProps {
  intent?: "danger" | "neutral" | "success" | "warning";
  label: string;
}

export function StatusPill({ intent = "neutral", label }: StatusPillProps) {
  return (
    <span className={`status-pill status-pill--${intent}`}>
      {label}
    </span>
  );
}
