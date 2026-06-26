import { useState } from "react";
import { useGetPowerCurve, getGetPowerCurveQueryKey } from "@workspace/api-client-react";
import type { GetPowerCurveParams } from "@workspace/api-client-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { TooltipProps } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartTooltip } from "@/components/chart-tooltip";
import { Zap } from "lucide-react";

type Range = "6w" | "ytd" | "lifetime";

const RANGE_LABELS: Record<Range, string> = {
  "6w": "Last 6 Weeks",
  "ytd": "Year to Date",
  "lifetime": "Lifetime",
};

const RANGES: Range[] = ["6w", "ytd", "lifetime"];

function Toggle<T extends string>({ options, value, onChange }: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-xs rounded-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const CustomTooltip = ({ active, payload }: TooltipProps<number, string>) => {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload as { label: string; watts: number | null };
  if (pt.watts == null) return null;
  return (
    <ChartTooltip
      label={pt.label}
      lines={[{ text: `${pt.watts} W`, color: "hsl(var(--primary))" }]}
    />
  );
};

const HIGHLIGHT_LABELS: Record<string, boolean> = {
  "5s": true, "1min": true, "5min": true, "20min": true, "1hr": true,
};

function usePowerRange(range: Range) {
  const params: GetPowerCurveParams = { range };
  return useGetPowerCurve(params, {
    query: { queryKey: getGetPowerCurveQueryKey(params) },
  });
}

export default function Power() {
  const [range, setRange] = useState<Range>("6w");

  const q6w       = usePowerRange("6w");
  const qYtd      = usePowerRange("ytd");
  const qLifetime = usePowerRange("lifetime");

  const dataByRange: Record<Range, ReturnType<typeof usePowerRange>["data"]> = {
    "6w": q6w.data,
    "ytd": qYtd.data,
    "lifetime": qLifetime.data,
  };

  const activeData = dataByRange[range];
  const isLoading  = { "6w": q6w.isLoading, "ytd": qYtd.isLoading, "lifetime": qLifetime.isLoading }[range];

  const chartData = activeData?.map((pt, i) => ({ ...pt, index: i })) ?? [];
  const hasData   = chartData.some((pt) => pt.watts != null);
  const highlights = chartData.filter((pt) => HIGHLIGHT_LABELS[pt.label] && pt.watts != null);

  // Build table rows: one per duration (use 6w as the canonical label/seconds list)
  const tableRows = (q6w.data ?? qYtd.data ?? qLifetime.data ?? []).map((pt) => {
    const get = (d: typeof q6w.data) =>
      d?.find((p) => p.seconds === pt.seconds)?.watts ?? null;
    return {
      seconds: pt.seconds,
      label: pt.label,
      "6w": get(q6w.data),
      "ytd": get(qYtd.data),
      "lifetime": get(qLifetime.data),
    };
  });

  const tableLoading = q6w.isLoading || qYtd.isLoading || qLifetime.isLoading;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Power</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Best mean power at every duration from device-measured rides
        </p>
      </div>

      {/* ── Power Curve Chart ── */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
            Power Curve · {RANGE_LABELS[range]}
          </h2>
          <Toggle
            options={[
              { label: "6 Weeks", value: "6w" },
              { label: "YTD",     value: "ytd" },
              { label: "Lifetime", value: "lifetime" },
            ]}
            value={range}
            onChange={(v) => setRange(v as Range)}
          />
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !hasData ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            No power data found for this period. Make sure you have rides with a power meter.
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <XAxis
                  dataKey="index"
                  type="number"
                  domain={[0, chartData.length - 1]}
                  tickCount={chartData.length}
                  tickFormatter={(i) => chartData[i]?.label ?? ""}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  tickFormatter={(v) => `${v}W`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
                <Line
                  type="monotone"
                  dataKey="watts"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "hsl(var(--primary))", stroke: "hsl(var(--card))", strokeWidth: 2 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>

            {highlights.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-border">
                {highlights.map((pt) => (
                  <div key={pt.label} className="flex flex-col items-center px-4 py-2 bg-muted/50 rounded-lg min-w-[72px]">
                    <span className="text-xs text-muted-foreground">{pt.label}</span>
                    <span className="text-lg font-bold text-foreground flex items-center gap-0.5">
                      <Zap className="w-3.5 h-3.5 text-yellow-500" />
                      {pt.watts}
                    </span>
                    <span className="text-[10px] text-muted-foreground">W</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Comparison Table ── */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
            Best Power · All Ranges
          </h2>
        </div>

        {tableLoading ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 11 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-24">
                  Duration
                </th>
                {RANGES.map((r) => (
                  <th
                    key={r}
                    className={`text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider ${
                      r === range ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {r === "6w" ? "6 Weeks" : r === "ytd" ? "YTD" : "Lifetime"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, i) => {
                const isHighlight = HIGHLIGHT_LABELS[row.label];
                return (
                  <tr
                    key={row.seconds}
                    className={`border-b border-border last:border-0 transition-colors ${
                      isHighlight ? "bg-muted/20" : ""
                    }`}
                  >
                    <td className={`px-5 py-3 ${isHighlight ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {row.label}
                    </td>
                    {RANGES.map((r) => {
                      const w = row[r];
                      const isActive = r === range;
                      return (
                        <td
                          key={r}
                          className={`px-5 py-3 text-right tabular-nums ${
                            isActive ? "font-semibold text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {w != null ? (
                            <>
                              {w}
                              <span className="text-xs ml-1 text-muted-foreground">W</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
