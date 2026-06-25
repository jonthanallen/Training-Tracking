import { useState, useMemo } from "react";
import {
  useGetAthlete,
  useGetWeeklyStats,
  useGetDailyStats,
  getGetAthleteQueryKey,
  getGetWeeklyStatsQueryKey,
  getGetDailyStatsQueryKey,
} from "@workspace/api-client-react";
import type { DailyActivity } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartMode = "hours" | "km";
type SportFilter = "All" | "Ride" | "Run" | "Swim" | "Other";

// ─── Heatmap helpers ──────────────────────────────────────────────────────────

const SPORT_COLORS: Record<SportFilter, { base: string; levels: string[] }> = {
  All:   { base: "hsl(15 90% 55%)",   levels: ["hsl(15 90% 18%)", "hsl(15 90% 32%)", "hsl(15 90% 44%)", "hsl(15 90% 55%)"] },
  Ride:  { base: "hsl(145 70% 42%)",  levels: ["hsl(145 70% 13%)", "hsl(145 70% 24%)", "hsl(145 70% 34%)", "hsl(145 70% 42%)"] },
  Run:   { base: "hsl(0 85% 52%)",    levels: ["hsl(0 85% 16%)", "hsl(0 85% 28%)", "hsl(0 85% 40%)", "hsl(0 85% 52%)"] },
  Swim:  { base: "hsl(207 90% 48%)",  levels: ["hsl(207 90% 15%)", "hsl(207 90% 26%)", "hsl(207 90% 36%)", "hsl(207 90% 48%)"] },
  Other: { base: "hsl(0 0% 55%)",     levels: ["hsl(0 0% 18%)", "hsl(0 0% 30%)", "hsl(0 0% 42%)", "hsl(0 0% 55%)"] },
};

function intensityLevel(minutes: number): number {
  if (minutes === 0) return -1;
  if (minutes < 30) return 0;
  if (minutes < 60) return 1;
  if (minutes < 120) return 2;
  return 3;
}

// Build a grid covering exactly 52 full weeks ending today (Sunday-anchored columns)
function buildCalendarGrid(
  dailyData: DailyActivity[],
  sport: SportFilter
): { date: string; minutes: number; level: number }[][] {
  // Aggregate: sum moving_time for the selected sport filter
  const dayMap = new Map<string, number>();
  for (const entry of dailyData) {
    const matches =
      sport === "All" ||
      entry.sport_type === sport;
    if (!matches) continue;
    const prev = dayMap.get(entry.date) ?? 0;
    dayMap.set(entry.date, prev + Math.round(entry.moving_time / 60));
  }

  // Find the most-recent Sunday (end of last complete week column)
  const today = new Date();
  // How many days since last Saturday (so last column ends on Saturday)
  const endOfGrid = new Date(today);
  // Align to Saturday (day 6); walk forward if needed
  const dayOfWeek = endOfGrid.getDay(); // 0=Sun..6=Sat
  const daysToSat = (6 - dayOfWeek + 7) % 7;
  endOfGrid.setDate(endOfGrid.getDate() + daysToSat);

  // 52 weeks × 7 days, columns left = oldest
  const WEEKS = 52;
  const weeks: { date: string; minutes: number; level: number }[][] = [];

  for (let w = WEEKS - 1; w >= 0; w--) {
    const col: { date: string; minutes: number; level: number }[] = [];
    for (let d = 6; d >= 0; d--) {
      const daysBack = w * 7 + d;
      const cell = new Date(endOfGrid);
      cell.setDate(endOfGrid.getDate() - daysBack);
      const dateStr = cell.toISOString().split("T")[0];
      const minutes = dayMap.get(dateStr) ?? 0;
      const isFuture = cell > today;
      col.unshift({ date: dateStr, minutes: isFuture ? 0 : minutes, level: isFuture ? -2 : intensityLevel(minutes) });
    }
    weeks.push(col);
  }

  return weeks;
}

// Month labels for the heatmap x-axis
function getMonthLabels(weeks: { date: string }[][]): { col: number; label: string }[] {
  const labels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  for (let i = 0; i < weeks.length; i++) {
    const firstDay = new Date(weeks[i][0].date);
    const month = firstDay.getMonth();
    if (month !== lastMonth) {
      labels.push({ col: i, label: firstDay.toLocaleDateString("en", { month: "short" }) });
      lastMonth = month;
    }
  }
  return labels;
}

// ─── Toggle button ─────────────────────────────────────────────────────────────

function Toggle<T extends string>({
  options,
  value,
  onChange,
}: {
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

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Stats() {
  const [chartMode, setChartMode] = useState<ChartMode>("hours");
  const [sportFilter, setSportFilter] = useState<SportFilter>("All");

  const { data: athlete } = useGetAthlete({ query: { queryKey: getGetAthleteQueryKey() } });
  const measurePref = athlete?.measurement_preference ?? "metric";

  const { data: weeklyStats, isLoading: loadingWeekly } = useGetWeeklyStats(
    { weeks: 52 },
    { query: { queryKey: getGetWeeklyStatsQueryKey({ weeks: 52 }) } }
  );

  const { data: dailyStats, isLoading: loadingDaily } = useGetDailyStats(
    { days: 364 },
    { query: { queryKey: getGetDailyStatsQueryKey({ days: 364 }) } }
  );

  // Weekly bar chart data
  const weeklyChartData = useMemo(() =>
    weeklyStats?.map((w) => ({
      week: new Date(w.week_start).toLocaleDateString("en", { month: "short", day: "numeric" }),
      hours: parseFloat((w.moving_time / 3600).toFixed(2)),
      km: measurePref === "imperial"
        ? parseFloat((w.distance * 0.000621371).toFixed(1))
        : parseFloat((w.distance / 1000).toFixed(1)),
    })),
    [weeklyStats, measurePref]
  );

  const latestIdx = (weeklyChartData?.length ?? 0) - 1;

  // Calendar heatmap grid
  const calendarGrid = useMemo(() =>
    dailyStats ? buildCalendarGrid(dailyStats, sportFilter) : [],
    [dailyStats, sportFilter]
  );

  const monthLabels = useMemo(() => getMonthLabels(calendarGrid), [calendarGrid]);
  const colorSet = SPORT_COLORS[sportFilter];
  const distUnit = measurePref === "imperial" ? "mi" : "km";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trends</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Rolling 52 weeks of training data</p>
      </div>

      {/* ── Weekly Volume Chart ── */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
            Weekly {chartMode === "hours" ? "Training Hours" : `Distance (${distUnit})`}
          </h2>
          <Toggle
            options={[
              { label: "Hours", value: "hours" },
              { label: distUnit.toUpperCase(), value: "km" },
            ]}
            value={chartMode}
            onChange={(v) => setChartMode(v as ChartMode)}
          />
        </div>

        {loadingWeekly ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={weeklyChartData} barSize={10} barCategoryGap="15%">
              <XAxis
                dataKey="week"
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval={7}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "hsl(var(--foreground))",
                }}
                formatter={(v: number) =>
                  chartMode === "hours"
                    ? [`${v.toFixed(2)} h`, "Hours"]
                    : [`${v} ${distUnit}`, "Distance"]
                }
              />
              <Bar dataKey={chartMode} radius={[2, 2, 0, 0]}>
                {weeklyChartData?.map((_, i) => (
                  <Cell
                    key={i}
                    fill={i === latestIdx ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.45)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Calendar Heatmap ── */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Activity Heatmap</h2>
          <Toggle
            options={[
              { label: "All", value: "All" },
              { label: "Ride", value: "Ride" },
              { label: "Run", value: "Run" },
              { label: "Swim", value: "Swim" },
              { label: "Other", value: "Other" },
            ]}
            value={sportFilter}
            onChange={(v) => setSportFilter(v as SportFilter)}
          />
        </div>

        {loadingDaily ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <div className="overflow-x-auto">
            {/* Month labels row */}
            <div className="flex mb-1" style={{ paddingLeft: 28 }}>
              {calendarGrid.map((_, colIdx) => {
                const label = monthLabels.find((m) => m.col === colIdx);
                return (
                  <div key={colIdx} style={{ width: 13, flexShrink: 0 }}>
                    {label ? (
                      <span className="text-[9px] text-muted-foreground whitespace-nowrap">{label.label}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Grid: rows = days of week, cols = weeks */}
            <div className="flex gap-0.5">
              {/* Day labels */}
              <div className="flex flex-col gap-0.5 mr-1 shrink-0">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
                  <div
                    key={d}
                    className="text-[9px] text-muted-foreground flex items-center"
                    style={{ height: 11, opacity: i % 2 === 0 ? 1 : 0 }}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Weeks */}
              {calendarGrid.map((week, colIdx) => (
                <div key={colIdx} className="flex flex-col gap-0.5">
                  {week.map((cell) => {
                    const bg =
                      cell.level === -2
                        ? "transparent"
                        : cell.level === -1
                        ? "hsl(var(--muted))"
                        : colorSet.levels[cell.level];
                    return (
                      <div
                        key={cell.date}
                        title={
                          cell.level >= 0
                            ? `${cell.date}: ${cell.minutes > 0 ? `${cell.minutes} min` : "rest"}`
                            : cell.date
                        }
                        style={{
                          width: 11,
                          height: 11,
                          borderRadius: 2,
                          backgroundColor: bg,
                          flexShrink: 0,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 mt-3 justify-end">
              <span className="text-[10px] text-muted-foreground">Less</span>
              {[-1, 0, 1, 2, 3].map((lvl) => (
                <div
                  key={lvl}
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 2,
                    backgroundColor: lvl === -1 ? "hsl(var(--muted))" : colorSet.levels[lvl],
                  }}
                />
              ))}
              <span className="text-[10px] text-muted-foreground">More</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
