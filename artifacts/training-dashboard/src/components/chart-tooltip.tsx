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
        padding: "7px 11px",
        fontSize: 12,
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      <p
        style={{
          color: "hsl(var(--muted-foreground))",
          marginBottom: lines.length ? 4 : 0,
          fontSize: 11,
        }}
      >
        {label}
      </p>
      {lines.map((l, i) => (
        <p
          key={i}
          style={{
            color: l.color,
            fontFamily: "monospace",
            fontWeight: 600,
            fontSize: 13,
            marginTop: i > 0 ? 2 : 0,
          }}
        >
          {l.text}
        </p>
      ))}
    </div>
  );
}
