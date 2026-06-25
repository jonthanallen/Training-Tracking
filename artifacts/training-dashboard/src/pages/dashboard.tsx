import { useState, useMemo } from "react";
import {
  useGetAthlete, useListActivities, useGetWeeklyStats, useGetDailyStats, useGetMonthlyStats,
  getGetAthleteQueryKey, getListActivitiesQueryKey, getGetWeeklyStatsQueryKey, getGetDailyStatsQueryKey, getGetMonthlyStatsQueryKey,
} from "@workspace/api-client-react";
import type { DailyActivity } from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import type { TooltipProps } from "recharts";
import { formatDistance, formatDuration, formatPace, formatElevation, sportTypeIcon, sportTypeColor, displaySportType } from "@/lib/utils-training";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartTooltip } from "@/components/chart-tooltip";
import { ArrowRight, TrendingUp, Clock, Mountain, Flame, Heart } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartMode = "hours" | "km";
type SportFilter = "All" | "Ride" | "Run" | "Swim" | "Other";

// ─── Toggle ───────────────────────────────────────────────────────────────────

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
          className={`px-2.5 py-1 text-xs rounded-sm font-medium transition-colors ${
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

// ─── Weekly volume area chart helpers ─────────────────────────────────────────

function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

const SPORT_COLOR: Record<SportFilter, string> = {
  All:   "hsl(15 90% 55%)",
  Ride:  "hsl(145 70% 42%)",
  Run:   "hsl(4 75% 57%)",
  Swim:  "hsl(207 90% 48%)",
  Other: "hsl(0 0% 55%)",
};

function weekRange(weekStart: string): string {
  const start = parseLocalDate(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const sm = start.toLocaleDateString("en", { month: "short" });
  const em = end.toLocaleDateString("en", { month: "short" });
  return sm === em
    ? `${sm} ${start.getDate()} – ${end.getDate()}`
    : `${sm} ${start.getDate()} – ${em} ${end.getDate()}`;
}

function buildWeeklyAreaData(
  weeklyStats: Array<{ week_start: string; distance: number; moving_time: number; elevation_gain: number; count: number; sport_type?: string }>,
  dailyStats: DailyActivity[],
  sport: SportFilter,
  mode: ChartMode,
  measurePref: string,
) {
  // For "All", just use the weekly totals directly
  // For a specific sport, filter daily data and aggregate per week
  if (sport === "All") {
    return weeklyStats.map((w) => ({
      label: parseLocalDate(w.week_start).toLocaleDateString("en", { month: "short", day: "numeric" }),
      weekRange: weekRange(w.week_start),
      value: mode === "hours"
        ? parseFloat((w.moving_time / 3600).toFixed(2))
        : measurePref === "imperial"
          ? parseFloat((w.distance * 0.000621371).toFixed(1))
          : parseFloat((w.distance / 1000).toFixed(1)),
    }));
  }

  // Group daily stats by week_start (Monday) for the chosen sport
  const getMondayStr = (dateStr: string): string => {
    const d = parseLocalDate(dateStr);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split("T")[0];
  };

  const weekMap = new Map<string, number>();
  for (const w of weeklyStats) weekMap.set(w.week_start, 0);

  for (const entry of dailyStats) {
    if (entry.sport_type !== sport) continue;
    const weekKey = getMondayStr(entry.date);
    if (!weekMap.has(weekKey)) continue;
    const add = mode === "hours"
      ? entry.moving_time / 3600
      : measurePref === "imperial"
        ? entry.distance * 0.000621371
        : entry.distance / 1000;
    weekMap.set(weekKey, (weekMap.get(weekKey) ?? 0) + add);
  }

  return weeklyStats.map((w) => ({
    label: parseLocalDate(w.week_start).toLocaleDateString("en", { month: "short", day: "numeric" }),
    weekRange: weekRange(w.week_start),
    value: parseFloat((weekMap.get(w.week_start) ?? 0).toFixed(2)),
  }));
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${String(mins).padStart(2, "0")}m`;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [chartMode, setChartMode] = useState<ChartMode>("hours");
  const [sportFilter, setSportFilter] = useState<SportFilter>("All");
  const [monthlyMode, setMonthlyMode] = useState<"hours" | "km">("hours");

  const { data: athlete } = useGetAthlete({ query: { queryKey: getGetAthleteQueryKey() } });
  const { data: activitiesRaw, isLoading: loadingActivities } = useListActivities(
    { per_page: 30 },
    { query: { queryKey: getListActivitiesQueryKey({ per_page: 30 }) } }
  );

  // Keep only activities from the current week and previous week (Monday-based)
  const activities = useMemo(() => {
    if (!activitiesRaw) return undefined;
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const diffToMonday = day === 0 ? 6 : day - 1;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - diffToMonday);
    thisMonday.setHours(0, 0, 0, 0);
    const prevMonday = new Date(thisMonday);
    prevMonday.setDate(thisMonday.getDate() - 7);
    return activitiesRaw.filter((a) => {
      const d = new Date(a.start_date_local ?? a.start_date);
      return d >= prevMonday;
    });
  }, [activitiesRaw]);
  const { data: weeklyStats, isLoading: loadingWeekly } = useGetWeeklyStats(
    { weeks: 12 },
    { query: { queryKey: getGetWeeklyStatsQueryKey({ weeks: 12 }) } }
  );
  const { data: dailyStats } = useGetDailyStats(
    { days: 90 },
    { query: { queryKey: getGetDailyStatsQueryKey({ days: 90 }) } }
  );
  const { data: monthlyStats, isLoading: loadingMonthly } = useGetMonthlyStats({
    query: { queryKey: getGetMonthlyStatsQueryKey() },
  });

  const measurePref = athlete?.measurement_preference ?? "metric";
  const distUnit = measurePref === "imperial" ? "mi" : "km";

  const thisWeek = weeklyStats?.[weeklyStats.length - 1];
  const lastWeek = weeklyStats?.[weeklyStats.length - 2];

  const areaData = useMemo(() => {
    if (!weeklyStats) return [];
    return buildWeeklyAreaData(weeklyStats, dailyStats ?? [], sportFilter, chartMode, measurePref);
  }, [weeklyStats, dailyStats, sportFilter, chartMode, measurePref]);

  const areaColor = SPORT_COLOR[sportFilter];

  const cumulativeMonthlyData = useMemo(() => {
    if (!monthlyStats?.days) return [];
    const todayDay = new Date().getDate();
    let cumThis = 0;
    let cumLast = 0;
    return monthlyStats.days.map((d) => {
      const thisVal = monthlyMode === "hours" ? (d.this_month ?? 0) : (d.this_month_km ?? 0);
      const lastVal = monthlyMode === "hours" ? (d.last_month ?? 0) : (d.last_month_km ?? 0);
      cumThis += thisVal;
      cumLast += lastVal;
      return {
        day: d.day,
        this_month: d.day <= todayDay ? parseFloat(cumThis.toFixed(2)) : null,
        last_month: parseFloat(cumLast.toFixed(2)),
      };
    });
  }, [monthlyStats, monthlyMode]);

  const AreaTooltipContent = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const v = payload[0].value as number;
    const row = payload[0].payload as { weekRange: string };
    const val = chartMode === "hours" ? fmtHours(v) : `${v.toFixed(1)} ${distUnit}`;
    return <ChartTooltip label={row.weekRange} lines={[{ text: val, color: areaColor }]} />;
  };

  const MonthlyTooltipContent = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const fmt = (v: number) => monthlyMode === "hours" ? fmtHours(v) : `${v.toFixed(1)} km`;
    const lines = payload
      .filter((p) => p.value != null)
      .map((p) => ({
        text: `${p.name}: ${fmt(p.value as number)}`,
        color: p.color ?? "hsl(var(--foreground))",
      }));
    if (!lines.length) return null;
    return <ChartTooltip label={`Day ${label}`} lines={lines} />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {athlete ? `Welcome back, ${athlete.firstname}` : "Dashboard"}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Your training at a glance</p>
      </div>

      {/* This Week Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Distance", value: thisWeek ? formatDistance(thisWeek.distance, measurePref) : "—", prev: lastWeek ? formatDistance(lastWeek.distance, measurePref) : null, icon: TrendingUp },
          { label: "Time", value: thisWeek ? formatDuration(thisWeek.moving_time) : "—", prev: lastWeek ? formatDuration(lastWeek.moving_time) : null, icon: Clock },
          { label: "Elevation", value: thisWeek ? formatElevation(thisWeek.elevation_gain, measurePref) : "—", prev: lastWeek ? formatElevation(lastWeek.elevation_gain, measurePref) : null, icon: Mountain },
          { label: "Activities", value: thisWeek ? String(thisWeek.count) : "—", prev: lastWeek ? String(lastWeek.count) : null, icon: Flame },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</span>
              <stat.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            {loadingWeekly ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <div>
                <div className="text-xl font-bold text-primary">{stat.value}</div>
                {stat.prev && (
                  <div className="text-xs text-muted-foreground mt-0.5">vs {stat.prev} last week</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-3 gap-6">

        {/* Weekly Volume — Area Chart */}
        <div className="md:col-span-2 bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Weekly Volume</h2>
            <div className="flex items-center gap-2">
              <Toggle
                options={[
                  { label: "Hours", value: "hours" },
                  { label: distUnit.toUpperCase(), value: "km" },
                ]}
                value={chartMode}
                onChange={(v) => setChartMode(v as ChartMode)}
              />
              <Toggle
                options={[
                  { label: "All", value: "All" },
                  { label: "Swim", value: "Swim" },
                  { label: "Bike", value: "Ride" },
                  { label: "Run", value: "Run" },
                  { label: "Other", value: "Other" },
                ]}
                value={sportFilter}
                onChange={(v) => setSportFilter(v as SportFilter)}
              />
            </div>
          </div>
          {loadingWeekly ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={areaData} margin={{ top: 4, right: 0, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={areaColor} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={areaColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={2}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={chartMode === "hours" ? 36 : 44}
                  tickCount={4}
                  tickFormatter={(v: number) => chartMode === "hours" ? fmtHours(v) : `${v.toFixed(0)}${distUnit}`}
                />
                <Tooltip content={<AreaTooltipContent />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
                <Area
                  type="linear"
                  dataKey="value"
                  stroke={areaColor}
                  strokeWidth={2}
                  fill="url(#areaGrad)"
                  dot={{ r: 3, fill: "hsl(var(--card))", stroke: areaColor, strokeWidth: 2 }}
                  activeDot={{ r: 4, fill: areaColor, stroke: areaColor }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Month vs Last Month */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Monthly Compare</h2>
            <div className="flex items-center bg-muted rounded-md p-0.5 gap-0.5">
              {(["hours", "km"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMonthlyMode(m)}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    monthlyMode === m
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "hours" ? "Hours" : "KM"}
                </button>
              ))}
            </div>
          </div>
          {loadingMonthly ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={cumulativeMonthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={4}
                />
                <YAxis hide />
                <Tooltip content={<MonthlyTooltipContent />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
                <Line
                  type="linear"
                  dataKey="last_month"
                  name={monthlyStats?.last_month_name}
                  stroke="hsl(var(--primary) / 0.35)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="linear"
                  dataKey="this_month"
                  name={monthlyStats?.this_month_name}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent Activities */}
      <div className="bg-card border border-border rounded-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Recent Activities</h2>
          <Link href="/activities" className="text-xs text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="divide-y divide-border">
          {loadingActivities
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-5 py-4 flex items-center gap-4">
                  <Skeleton className="w-10 h-10 rounded-md shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                  <div className="space-y-1 text-right">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                </div>
              ))
            : activities?.length === 0
              ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">No activities this week or last week.</div>
                )
              : activities?.map((act) => (
                  <Link key={act.id} href={`/activities/${act.id}`}>
                    <div className="px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors cursor-pointer group">
                      <div className={`p-2.5 rounded-md bg-muted shrink-0 ${sportTypeColor(act.sport_type)}`}>
                        {(() => { const Icon = sportTypeIcon(act.sport_type); return <Icon className="w-5 h-5" />; })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-primary group-hover:text-foreground transition-colors">{act.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(act.start_date_local ?? act.start_date).toLocaleDateString("en", {
                            weekday: "short", month: "short", day: "numeric",
                          })}
                          {" · "}
                          <span>{displaySportType(act.sport_type)}</span>
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground shrink-0">
                        <div className="text-right">
                          <p className="font-semibold text-foreground">{formatDistance(act.distance, measurePref)}</p>
                          <p className="text-xs">{formatPace(act.average_speed ?? 0, act.sport_type, measurePref)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-foreground">{formatDuration(act.moving_time)}</p>
                          <p className="text-xs flex items-center justify-end gap-0.5">
                            <Mountain className="w-3 h-3" />
                            {formatElevation(act.total_elevation_gain ?? 0, measurePref)}
                          </p>
                        </div>
                        {act.average_heartrate && (
                          <div className="text-right">
                            <p className="text-foreground flex items-center justify-end gap-1">
                              <Heart className="w-3 h-3 text-red-500" />
                              {Math.round(act.average_heartrate)}
                            </p>
                            <p className="text-xs">avg bpm</p>
                          </div>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </div>
                  </Link>
                ))}
        </div>
      </div>
    </div>
  );
}
