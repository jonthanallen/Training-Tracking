import { useState, useEffect } from "react";
import { useGetAthlete, useListActivities, getGetAthleteQueryKey, getListActivitiesQueryKey } from "@workspace/api-client-react";
import type { Activity } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatDistance, formatDuration, formatPace, formatElevation, sportTypeIcon, sportTypeColor } from "@/lib/utils-training";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight, Heart, Mountain, ChevronDown } from "lucide-react";

const PER_PAGE = 30;

const SPORT_FILTERS = [
  { label: "All", value: "All" },
  { label: "Run", value: "Run" },
  { label: "Ride", value: "Ride" },
  { label: "Swim", value: "Swim" },
  { label: "Walk", value: "Walk" },
  { label: "Hike", value: "Hike" },
  { label: "Weights", value: "WeightTraining" },
  { label: "Workout", value: "Workout" },
];

export default function Activities() {
  const [page, setPage] = useState(1);
  const [sportType, setSportType] = useState("All");
  const [allActivities, setAllActivities] = useState<Activity[]>([]);

  const { data: athlete } = useGetAthlete({ query: { queryKey: getGetAthleteQueryKey() } });
  const measurePref = athlete?.measurement_preference ?? "metric";

  const params = { per_page: PER_PAGE, page, ...(sportType !== "All" ? { type: sportType } : {}) };
  const { data: newActivities, isLoading, isFetching } = useListActivities(
    params,
    { query: { queryKey: getListActivitiesQueryKey(params) } }
  );

  useEffect(() => {
    if (!newActivities) return;
    if (page === 1) {
      setAllActivities(newActivities);
    } else {
      setAllActivities((prev) => [...prev, ...newActivities]);
    }
  }, [newActivities, page]);

  const handleSportChange = (val: string) => {
    setSportType(val);
    setPage(1);
    setAllActivities([]);
  };

  const hasMore = (newActivities?.length ?? 0) === PER_PAGE;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Activities</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Your complete training log</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SPORT_FILTERS.map((f) => {
          const active = sportType === f.value;
          const Icon = f.value !== "All" ? sportTypeIcon(f.value) : null;
          return (
            <button
              key={f.value}
              onClick={() => handleSportChange(f.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-lg divide-y divide-border">
        {isLoading && page === 1
          ? Array.from({ length: 8 }).map((_, i) => (
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
          : allActivities.map((act) => (
              <Link key={act.id} href={`/activities/${act.id}`}>
                <div className="px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors cursor-pointer group">
                  <div className={`p-2.5 rounded-md bg-muted shrink-0 ${sportTypeColor(act.sport_type)}`}>
                    {(() => { const Icon = sportTypeIcon(act.sport_type); return <Icon className="w-5 h-5" />; })()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-primary group-hover:text-foreground transition-colors">{act.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(act.start_date_local ?? act.start_date).toLocaleDateString("en", {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                      {" · "}
                      <span className="capitalize">{act.sport_type}</span>
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

        {allActivities.length === 0 && !isLoading && (
          <div className="py-16 text-center text-muted-foreground">
            <p className="text-sm">No activities found{sportType !== "All" ? ` for ${sportType}` : ""}.</p>
          </div>
        )}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
            disabled={isFetching}
            className="gap-2 text-foreground"
          >
            <ChevronDown className="w-4 h-4" />
            {isFetching ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
