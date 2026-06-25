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

const SPORT_COLOR: Record<SportFilter, string> = {
  All:   "hsl(15 90% 55%)",
  Ride:  "hsl(145 70% 42%)",
  Run:   "hsl(0 85% 52%)",
  Swim:  "hsl(207 90% 48%)",
  Other: "hsl(0 0% 55%)",
};

// Build a grid covering exactly 52 full weeks ending on the next Saturday
function buildCalendarGrid(
  dailyData: DailyActivity[],
  sport: SportFilter
): { date: string; trained: boolean }[][] {
  const dayMap = new Set<string>();
  for (const entry of dailyData) {
    if (sport !== "All" && entry.sport_type !== sport) continue;
    if (entry.moving_time > 0) dayMap.add(entry.date);
  }

  const today = new Date();
  const endOfGrid = new Date(today);
  const daysToSat = (6 - endOfGrid.getDay() + 7) % 7;
  endOfGrid.setDate(endOfGrid.getDate() + daysToSat);

  const WEEKS = 52;
  const weeks: { date: string; trained: boolean }[][] = [];

  for (let w = WEEKS - 1; w >= 0; w--) {
    const col: { date: string; trained: boolean }[] = [];
    for (let d = 6; d >= 0; d--) {
      const cell = new Date(endOfGrid);
      cell.setDate(endOfGrid.getDate() - (w * 7 + d));
      const dateStr = cell.toISOString().split("T")[0];
      const isFuture = cell > today;
      col.unshift({ date: dateStr, trained: !isFuture && dayMap.has(dateStr) });
    }
    weeks.push(col);
  }

  return weeks;
}

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

  const calendarGrid = useMemo(() =>
    dailyStats ? buildCalendarGrid(dailyStats, sportFilter) : [],
    [dailyStats, sportFilter]
  );

  const monthLabels = useMemo(() => getMonthLabels(calendarGrid), [calendarGrid]);
  const activeColor = SPORT_COLOR[sportFilter];
  const distUnit = measurePref === "imperial" ? "mi" : "km";

  return (
    <div className="space-y-8">
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
            <BarChart data={weeklyChartData} barSize={14} barCategoryGap="4%">
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
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="w-full">
            {/* Month labels — aligned to week columns */}
            <div className="flex w-full mb-1" style={{ paddingLeft: 30 }}>
              {calendarGrid.map((_, colIdx) => {
                const label = monthLabels.find((m) => m.col === colIdx);
                return (
                  <div key={colIdx} style={{ flex: 1, minWidth: 0 }}>
                    {label && (
                      <span className="text-[9px] text-muted-foreground whitespace-nowrap leading-none">
                        {label.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Grid */}
            <div className="flex w-full gap-[2px]">
              {/* Day-of-week labels */}
              <div className="flex flex-col gap-[2px] shrink-0" style={{ width: 28 }}>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
                  <div
                    key={d}
                    className="text-[9px] text-muted-foreground flex items-center"
                    style={{ height: 13, visibility: i % 2 === 0 ? "visible" : "hidden" }}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Week columns — fill remaining width equally */}
              {calendarGrid.map((week, colIdx) => (
                <div key={colIdx} className="flex flex-col gap-[2px]" style={{ flex: 1, minWidth: 0 }}>
                  {week.map((cell) => {
                    const bg = cell.trained
                      ? activeColor
                      : "hsl(var(--muted))";
                    return (
                      <div
                        key={cell.date}
                        title={`${cell.date}${cell.trained ? " ✓" : ""}`}
                        style={{
                          width: "100%",
                          aspectRatio: "1 / 1",
                          borderRadius: 2,
                          backgroundColor: bg,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 mt-3 justify-end">
              <div style={{ width: 11, height: 11, borderRadius: 2, backgroundColor: "hsl(var(--muted))" }} />
              <span className="text-[10px] text-muted-foreground">Rest</span>
              <div style={{ width: 11, height: 11, borderRadius: 2, backgroundColor: activeColor }} />
              <span className="text-[10px] text-muted-foreground">Trained</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
