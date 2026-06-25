export function ChartTooltip({
  label,
  lines,
}: {
  label: string;
  lines: { text: string; color: string }[];
}) {
  return (
    <div
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 6,
        padding: "8px 12px",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      <p
        style={{
          color: "hsl(var(--muted-foreground))",
          fontSize: 11,
          marginBottom: lines.length ? 3 : 0,
        }}
      >
        {label}
      </p>
      {lines.map((l, i) => (
        <p
          key={i}
          style={{
            color: l.color,
            fontSize: 14,
            fontWeight: 600,
            marginTop: i > 0 ? 2 : 0,
          }}
        >
          {l.text}
        </p>
      ))}
    </div>
  );
}
