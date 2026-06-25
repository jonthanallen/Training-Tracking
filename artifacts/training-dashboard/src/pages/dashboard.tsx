import { useGetAthlete, useListActivities, useGetWeeklyStats, useGetActivityTypes, getGetAthleteQueryKey, getListActivitiesQueryKey, getGetWeeklyStatsQueryKey, getGetActivityTypesQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatDistance, formatDuration, formatPace, formatElevation, sportTypeIcon, sportTypeColor } from "@/lib/utils-training";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, TrendingUp, Clock, Mountain, Flame } from "lucide-react";

export default function Dashboard() {
  const { data: athlete } = useGetAthlete({ query: { queryKey: getGetAthleteQueryKey() } });
  const { data: activities, isLoading: loadingActivities } = useListActivities(
    { per_page: 6 },
    { query: { queryKey: getListActivitiesQueryKey({ per_page: 6 }) } }
  );
  const { data: weeklyStats, isLoading: loadingWeekly } = useGetWeeklyStats(
    { weeks: 12 },
    { query: { queryKey: getGetWeeklyStatsQueryKey({ weeks: 12 }) } }
  );
  const { data: activityTypes } = useGetActivityTypes({ query: { queryKey: getGetActivityTypesQueryKey() } });

  const measurePref = athlete?.measurement_preference ?? "metric";

  const thisWeek = weeklyStats?.[weeklyStats.length - 1];
  const lastWeek = weeklyStats?.[weeklyStats.length - 2];

  const weeklyChartData = weeklyStats?.map((w) => ({
    week: new Date(w.week_start).toLocaleDateString("en", { month: "short", day: "numeric" }),
    distance: measurePref === "imperial" ? w.distance * 0.000621371 : w.distance / 1000,
    count: w.count,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {athlete ? `Welcome back, ${athlete.firstname}` : "Dashboard"}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Your training at a glance</p>
      </div>

      {/* This Week Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Distance",
            value: thisWeek ? formatDistance(thisWeek.distance, measurePref) : "—",
            prev: lastWeek ? formatDistance(lastWeek.distance, measurePref) : null,
            icon: TrendingUp,
          },
          {
            label: "Moving Time",
            value: thisWeek ? formatDuration(thisWeek.moving_time) : "—",
            prev: lastWeek ? formatDuration(lastWeek.moving_time) : null,
            icon: Clock,
          },
          {
            label: "Elevation",
            value: thisWeek ? formatElevation(thisWeek.elevation_gain, measurePref) : "—",
            prev: lastWeek ? formatElevation(lastWeek.elevation_gain, measurePref) : null,
            icon: Mountain,
          },
          {
            label: "Activities",
            value: thisWeek ? String(thisWeek.count) : "—",
            prev: lastWeek ? String(lastWeek.count) : null,
            icon: Flame,
          },
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
                <div className="text-xl font-bold font-mono">{stat.value}</div>
                {stat.prev && (
                  <div className="text-xs text-muted-foreground mt-0.5">vs {stat.prev} last week</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Weekly Volume Chart */}
        <div className="md:col-span-2 bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Weekly Volume</h2>
            <span className="text-xs text-muted-foreground">Last 12 weeks</span>
          </div>
          {loadingWeekly ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={weeklyChartData} barSize={16}>
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  formatter={(v: number) => [`${v.toFixed(1)} ${measurePref === "imperial" ? "mi" : "km"}`, "Distance"]}
                />
                <Bar dataKey="distance" radius={[3, 3, 0, 0]}>
                  {weeklyChartData?.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={i === (weeklyChartData.length - 1) ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.4)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Sport Type Breakdown */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">By Sport</h2>
          <div className="space-y-3">
            {activityTypes?.slice(0, 5).map((t) => (
              <div key={t.sport_type} className="flex items-center gap-3">
                <div className={`${sportTypeColor(t.sport_type)}`}>
                  {(() => { const Icon = sportTypeIcon(t.sport_type); return <Icon className="w-4 h-4" />; })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{t.sport_type}</span>
                    <span className="text-xs text-muted-foreground font-mono ml-2">{t.count}</span>
                  </div>
                  <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: `${((t.count / (activityTypes?.[0]?.count ?? 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
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
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-4">
                  <Skeleton className="w-8 h-8 rounded-md" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))
            : activities?.map((act) => (
                <Link key={act.id} href={`/activities/${act.id}`}>
                  <div className="px-5 py-3 flex items-center gap-4 hover:bg-muted/40 transition-colors cursor-pointer group">
                    <div className={`p-2 rounded-md bg-muted ${sportTypeColor(act.sport_type)}`}>
                      {(() => { const Icon = sportTypeIcon(act.sport_type); return <Icon className="w-4 h-4" />; })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{act.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(act.start_date_local ?? act.start_date).toLocaleDateString("en", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <p className="text-sm font-mono font-medium">{formatDistance(act.distance, measurePref)}</p>
                      <p className="text-xs text-muted-foreground font-mono">{formatPace(act.average_speed ?? 0, act.sport_type, measurePref)}</p>
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
