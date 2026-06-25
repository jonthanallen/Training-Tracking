import { useState, useMemo, useRef } from "react";
import {
  useGetAthlete,
  useGetWeeklyStats,
  useGetDailyStats,
  getGetAthleteQueryKey,
  getGetWeeklyStatsQueryKey,
  getGetDailyStatsQueryKey,
} from "@workspace/api-client-react";
import type { DailyActivity } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { TooltipProps } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartTooltip } from "@/components/chart-tooltip";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartMode = "hours" | "km";
type SportFilter = "All" | "Ride" | "Run" | "Swim" | "Other";

interface CellActivity { sport_type: string; distance: number }
interface CalendarCell { date: string; trained: boolean; activities: CellActivity[] }

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

function formatWeekRange(weekStart: string): string {
  const start = parseLocalDate(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startMonth = start.toLocaleDateString("en", { month: "short" });
  const endMonth   = end.toLocaleDateString("en",   { month: "short" });
  if (startMonth === endMonth) return `${startMonth} ${start.getDate()} - ${end.getDate()}`;
  return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
}

function formatDayLabel(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
}

function formatDist(meters: number, measurePref: string): string {
  if (!meters) return "";
  if (measurePref === "imperial") return `${(meters * 0.000621371).toFixed(2)} mi`;
  return `${(meters / 1000).toFixed(2)} km`;
}

// ─── Sport color ──────────────────────────────────────────────────────────────

const SPORT_COLOR: Record<SportFilter, string> = {
  All:   "hsl(15 90% 55%)",
  Ride:  "hsl(145 70% 42%)",
  Run:   "hsl(4 75% 57%)",
  Swim:  "hsl(207 90% 48%)",
  Other: "hsl(0 0% 55%)",
};

// ─── Calendar grid (Mon top → Sun bottom, left = oldest week) ────────────────

function buildCalendarGrid(
  dailyData: DailyActivity[],
  sport: SportFilter
): CalendarCell[][] {
  // Build: date → list of matching activities
  const dayMap = new Map<string, CellActivity[]>();
  for (const entry of dailyData) {
    const matches = sport === "All" || entry.sport_type === sport;
    if (!matches || entry.moving_time <= 0) continue;
    const list = dayMap.get(entry.date) ?? [];
    list.push({ sport_type: entry.sport_type, distance: entry.distance });
    dayMap.set(entry.date, list);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find the most recent Sunday (so the last column ends on Sunday)
  const lastSunday = new Date(today);
  lastSunday.setDate(today.getDate() + ((7 - today.getDay()) % 7));

  // First Monday = lastSunday - 52*7 + 1 days
  const firstMonday = new Date(lastSunday);
  firstMonday.setDate(lastSunday.getDate() - 52 * 7 + 1);

  // Build 52 columns (weeks), each with 7 rows (Mon=0 … Sun=6)
  const weeks: CalendarCell[][] = [];
  for (let w = 0; w < 52; w++) {
    const col: CalendarCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(firstMonday);
      cell.setDate(firstMonday.getDate() + w * 7 + d);
      const dateStr = cell.toISOString().split("T")[0];
      const isFuture = cell > today;
      const activities = (!isFuture && dayMap.get(dateStr)) || [];
      col.push({ date: dateStr, trained: activities.length > 0, activities });
    }
    weeks.push(col);
  }
  return weeks;
}

// Month labels: position above the first column that starts a new month
function getMonthLabels(weeks: CalendarCell[][]): { col: number; label: string }[] {
  const labels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  for (let i = 0; i < weeks.length; i++) {
    const monday = parseLocalDate(weeks[i][0].date);
    const month = monday.getMonth();
    if (month !== lastMonth) {
      labels.push({ col: i, label: monday.toLocaleDateString("en", { month: "short" }) });
      lastMonth = month;
    }
  }
  return labels;
}


// ─── Toggle button ─────────────────────────────────────────────────────────────

function Toggle<T extends string>({
  options, value, onChange,
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
  const [hoverCell, setHoverCell] = useState<{ cell: CalendarCell; x: number; y: number } | null>(null);
  const heatmapRef = useRef<HTMLDivElement>(null);

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

  const distUnit = measurePref === "imperial" ? "mi" : "km";

  const weeklyChartData = useMemo(() =>
    weeklyStats?.map((w) => ({
      weekLabel: parseLocalDate(w.week_start).toLocaleDateString("en", { month: "short", day: "numeric" }),
      weekRange: formatWeekRange(w.week_start),
      hours: parseFloat((w.moving_time / 3600).toFixed(2)),
      km: measurePref === "imperial"
        ? parseFloat((w.distance * 0.000621371).toFixed(1))
        : parseFloat((w.distance / 1000).toFixed(1)),
    })),
    [weeklyStats, measurePref]
  );



  const calendarGrid = useMemo(
    () => dailyStats ? buildCalendarGrid(dailyStats, sportFilter) : [],
    [dailyStats, sportFilter]
  );

  const monthLabels = useMemo(() => getMonthLabels(calendarGrid), [calendarGrid]);
  const activeColor = SPORT_COLOR[sportFilter];

  const CustomBarTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as { weekRange: string; hours: number; km: number };
    const val = chartMode === "hours" ? `${row.hours.toFixed(2)} h` : `${row.km} ${distUnit}`;
    return <ChartTooltip label={row.weekRange} lines={[{ text: val, color: "hsl(15 90% 55%)" }]} />;
  };

  // Day-of-week labels: Mon(0)…Sun(6), show Mon/Wed/Fri/Sun
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
                dataKey="weekLabel"
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
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
              <Bar dataKey={chartMode} radius={[2, 2, 0, 0]} fill="hsl(var(--primary))" />
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
          <div className="w-full relative" ref={heatmapRef}>
            {/* Floating tooltip */}
            {hoverCell && (
              <div
                style={{
                  position: "absolute",
                  left: hoverCell.x,
                  top: hoverCell.y - 10,
                  transform: "translate(-50%, -100%)",
                  zIndex: 50,
                }}
              >
                <ChartTooltip
                  label={formatDayLabel(hoverCell.cell.date)}
                  lines={
                    hoverCell.cell.activities.length > 0
                      ? hoverCell.cell.activities.map((a) => ({
                          text: `${a.sport_type}${a.distance ? `  ${formatDist(a.distance, measurePref)}` : ""}`,
                          color: SPORT_COLOR[a.sport_type as SportFilter] ?? SPORT_COLOR.Other,
                        }))
                      : [{ text: "Rest", color: "hsl(var(--muted-foreground))" }]
                  }
                />
              </div>
            )}

            {/* Month labels aligned with week columns */}
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
              {/* Day-of-week labels: Mon … Sun */}
              <div className="flex flex-col gap-[2px] shrink-0" style={{ width: 28 }}>
                {DAY_LABELS.map((d, i) => (
                  <div
                    key={d}
                    className="text-[9px] text-muted-foreground flex items-center"
                    style={{ height: 13, visibility: i % 2 === 0 ? "visible" : "hidden" }}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Week columns */}
              {calendarGrid.map((week, colIdx) => (
                <div key={colIdx} className="flex flex-col gap-[2px]" style={{ flex: 1, minWidth: 0 }}>
                  {week.map((cell) => (
                    <div
                      key={cell.date}
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        borderRadius: 2,
                        backgroundColor: cell.trained ? activeColor : "hsl(var(--muted))",
                        cursor: "default",
                      }}
                      onMouseEnter={(e) => {
                        if (!heatmapRef.current) return;
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        const containerRect = heatmapRef.current.getBoundingClientRect();
                        setHoverCell({
                          cell,
                          x: rect.left - containerRect.left + rect.width / 2,
                          y: rect.top - containerRect.top,
                        });
                      }}
                      onMouseLeave={() => setHoverCell(null)}
                    />
                  ))}
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
