import { useGetAthlete, useGetStats, useGetWeeklyStats, useGetActivityTypes, getGetAthleteQueryKey, getGetStatsQueryKey, getGetWeeklyStatsQueryKey, getGetActivityTypesQueryKey } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { formatDistance, formatDuration, formatElevation } from "@/lib/utils-training";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const SPORT_COLORS: Record<string, string> = {
  Run: "hsl(15 90% 55%)",
  Ride: "hsl(210 100% 50%)",
  Swim: "hsl(160 80% 40%)",
  Walk: "hsl(45 100% 50%)",
  WeightTraining: "hsl(280 80% 50%)",
  Workout: "hsl(280 80% 50%)",
  Hike: "hsl(120 60% 40%)",
};

function getSportColor(sport: string, idx: number): string {
  return SPORT_COLORS[sport] ?? `hsl(${(idx * 50 + 200) % 360} 70% 50%)`;
}

export default function Stats() {
  const { data: athlete } = useGetAthlete({ query: { queryKey: getGetAthleteQueryKey() } });
  const { data: stats, isLoading: loadingStats } = useGetStats({ query: { queryKey: getGetStatsQueryKey() } });
  const { data: weeklyStats, isLoading: loadingWeekly } = useGetWeeklyStats(
    { weeks: 24 },
    { query: { queryKey: getGetWeeklyStatsQueryKey({ weeks: 24 }) } }
  );
  const { data: activityTypes } = useGetActivityTypes({ query: { queryKey: getGetActivityTypesQueryKey() } });

  const measurePref = athlete?.measurement_preference ?? "metric";

  const weeklyChartData = weeklyStats?.map((w) => ({
    week: new Date(w.week_start).toLocaleDateString("en", { month: "short", day: "numeric" }),
    distance: measurePref === "imperial" ? parseFloat((w.distance * 0.000621371).toFixed(1)) : parseFloat((w.distance / 1000).toFixed(1)),
    time: Math.round(w.moving_time / 60),
    elevation: measurePref === "imperial" ? Math.round(w.elevation_gain * 3.28084) : Math.round(w.elevation_gain),
    count: w.count,
  }));

  const pieData = activityTypes?.slice(0, 6).map((t) => ({
    name: t.sport_type,
    value: t.count,
  }));

  const sportRows = [
    { key: "run", label: "Running", ytd: stats?.ytd_run_totals, allTime: stats?.all_run_totals, recent: stats?.recent_run_totals },
    { key: "ride", label: "Cycling", ytd: stats?.ytd_ride_totals, allTime: stats?.all_ride_totals, recent: stats?.recent_ride_totals },
    { key: "swim", label: "Swimming", ytd: stats?.ytd_swim_totals, allTime: stats?.all_swim_totals, recent: stats?.recent_swim_totals },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Training totals and trends</p>
      </div>

      {/* Totals by sport */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Totals by Sport</h2>
        </div>
        <Tabs defaultValue="ytd">
          <div className="px-5 pt-3">
            <TabsList>
              <TabsTrigger value="ytd">Year to Date</TabsTrigger>
              <TabsTrigger value="recent">Last 4 Weeks</TabsTrigger>
              <TabsTrigger value="alltime">All Time</TabsTrigger>
            </TabsList>
          </div>
          {["ytd", "recent", "alltime"].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="px-5 py-2 text-left">Sport</th>
                      <th className="px-5 py-2 text-right">Activities</th>
                      <th className="px-5 py-2 text-right">Distance</th>
                      <th className="px-5 py-2 text-right">Time</th>
                      <th className="px-5 py-2 text-right">Elevation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loadingStats
                      ? Array.from({ length: 3 }).map((_, i) => (
                          <tr key={i}>
                            {Array.from({ length: 5 }).map((_, j) => (
                              <td key={j} className="px-5 py-3">
                                <Skeleton className="h-4 w-16" />
                              </td>
                            ))}
                          </tr>
                        ))
                      : sportRows.map((row) => {
                          const totals = tab === "ytd" ? row.ytd : tab === "recent" ? row.recent : row.allTime;
                          if (!totals || totals.count === 0) return null;
                          return (
                            <tr key={row.key} className="hover:bg-muted/40 transition-colors">
                              <td className="px-5 py-3 font-medium">{row.label}</td>
                              <td className="px-5 py-3 text-right font-mono">{totals.count}</td>
                              <td className="px-5 py-3 text-right font-mono">{formatDistance(totals.distance, measurePref)}</td>
                              <td className="px-5 py-3 text-right font-mono">{formatDuration(totals.moving_time)}</td>
                              <td className="px-5 py-3 text-right font-mono">{formatElevation(totals.elevation_gain, measurePref)}</td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Weekly charts */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Weekly Distance ({measurePref === "imperial" ? "mi" : "km"})
          </h2>
          {loadingWeekly ? (
            <Skeleton className="h-44 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={176}>
              <BarChart data={weeklyChartData} barSize={14}>
                <XAxis dataKey="week" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval={3} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={35} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px", color: "hsl(var(--foreground))" }}
                  formatter={(v: number) => [`${v} ${measurePref === "imperial" ? "mi" : "km"}`, "Distance"]}
                />
                <Bar dataKey="distance" fill="hsl(var(--primary) / 0.6)" radius={[3, 3, 0, 0]}>
                  {weeklyChartData?.map((_, i) => (
                    <Cell key={i} fill={i === (weeklyChartData.length - 1) ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.5)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Sport Breakdown</h2>
          {!activityTypes ? (
            <Skeleton className="h-44 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={176}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="40%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  strokeWidth={0}
                >
                  {pieData?.map((entry, i) => (
                    <Cell key={i} fill={getSportColor(entry.name, i)} />
                  ))}
                </Pie>
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  formatter={(v) => <span style={{ fontSize: 12, color: "hsl(var(--foreground))" }}>{v}</span>}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px", color: "hsl(var(--foreground))" }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Weekly time */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Weekly Time (min)</h2>
        {loadingWeekly ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={weeklyChartData} barSize={14}>
              <XAxis dataKey="week" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={35} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px", color: "hsl(var(--foreground))" }}
                formatter={(v: number) => [`${v} min`, "Time"]}
              />
              <Bar dataKey="time" fill="hsl(210 100% 50% / 0.5)" radius={[3, 3, 0, 0]}>
                {weeklyChartData?.map((_, i) => (
                  <Cell key={i} fill={i === (weeklyChartData.length - 1) ? "hsl(210 100% 50%)" : "hsl(210 100% 50% / 0.5)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
