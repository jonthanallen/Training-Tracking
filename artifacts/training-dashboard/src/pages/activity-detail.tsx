import { useParams, Link } from "wouter";
import { useEffect, useRef } from "react";
import { useGetAthlete, useGetActivity, useGetActivityStreams, getGetAthleteQueryKey, getGetActivityQueryKey, getGetActivityStreamsQueryKey } from "@workspace/api-client-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { TooltipProps } from "recharts";
import { formatDistance, formatDuration, formatPace, formatElevation, sportTypeIcon, sportTypeColor } from "@/lib/utils-training";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChartTooltip } from "@/components/chart-tooltip";
import { ArrowLeft, Heart, Zap, Activity, Mountain, Timer, Flame, Trophy, Wind } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function RouteMap({ latlng }: { latlng: number[][] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || !latlng || latlng.length < 2) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
      dragging: true,
      doubleClickZoom: true,
      boxZoom: true,
      keyboard: true,
      touchZoom: true,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    const latLngs = latlng.map((p) => [p[0], p[1]] as [number, number]);
    const polyline = L.polyline(latLngs, {
      color: "hsl(24, 90%, 50%)",
      weight: 3,
      opacity: 0.95,
      lineJoin: "round",
    }).addTo(map);

    const startIcon = L.divIcon({
      className: "",
      html: `<div style="width:10px;height:10px;border-radius:50%;background:hsl(24,90%,50%);border:2px solid white;"></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });
    const endIcon = L.divIcon({
      className: "",
      html: `<div style="width:10px;height:10px;border-radius:50%;background:white;border:2px solid hsl(24,90%,50%);"></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });

    L.marker(latLngs[0], { icon: startIcon }).addTo(map);
    L.marker(latLngs[latLngs.length - 1], { icon: endIcon }).addTo(map);

    const initialBounds = polyline.getBounds();
    map.fitBounds(initialBounds, { padding: [8, 8] });

    const ZoomResetControl = L.Control.extend({
      options: { position: "topleft" },
      onAdd() {
        const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control");
        const btnStyle = "width:26px;height:26px;font-size:16px;line-height:26px;cursor:pointer;background:#fff;border:none;display:block;text-align:center;text-decoration:none;color:#444;";

        const zoomIn = L.DomUtil.create("a", "", bar) as HTMLAnchorElement;
        zoomIn.innerHTML = "+";
        zoomIn.title = "Zoom in";
        zoomIn.style.cssText = btnStyle;
        L.DomEvent.on(zoomIn, "click", (e) => { L.DomEvent.stopPropagation(e); map.zoomIn(); });

        const zoomOut = L.DomUtil.create("a", "", bar) as HTMLAnchorElement;
        zoomOut.innerHTML = "−";
        zoomOut.title = "Zoom out";
        zoomOut.style.cssText = btnStyle;
        L.DomEvent.on(zoomOut, "click", (e) => { L.DomEvent.stopPropagation(e); map.zoomOut(); });

        const reset = L.DomUtil.create("a", "", bar) as HTMLAnchorElement;
        reset.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>`;
        reset.title = "Reset view";
        reset.style.cssText = btnStyle;
        L.DomEvent.on(reset, "click", (e) => { L.DomEvent.stopPropagation(e); map.fitBounds(initialBounds, { padding: [8, 8] }); });

        return bar;
      },
    });
    new ZoomResetControl().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [latlng]);

  if (!latlng || latlng.length < 2) return null;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Route</h3>
      </div>
      <div ref={containerRef} style={{ height: 280 }} />
    </div>
  );
}

function ElevationChart({ altitude, distance, measurePref }: { altitude: number[]; distance: number[]; measurePref: string }) {
  const step = Math.max(1, Math.floor(altitude.length / 300));
  const data = altitude
    .filter((_, i) => i % step === 0)
    .map((alt, i) => ({
      dist: measurePref === "imperial"
        ? ((distance[i * step] ?? 0) * 0.000621371).toFixed(2)
        : ((distance[i * step] ?? 0) / 1000).toFixed(2),
      elev: measurePref === "imperial" ? Math.round(alt * 3.28084) : Math.round(alt),
    }));

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Elevation Profile</h3>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="dist" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            content={({ active, payload, label }: TooltipProps<number, string>) => {
              if (!active || !payload?.length) return null;
              const distSuffix = measurePref === "imperial" ? "mi" : "km";
              const elevSuffix = measurePref === "imperial" ? "ft" : "m";
              return (
                <ChartTooltip
                  label={`${label} ${distSuffix}`}
                  lines={[{ text: `${payload[0].value} ${elevSuffix}`, color: "hsl(15 90% 55%)" }]}
                />
              );
            }}
            cursor={{ stroke: "hsl(var(--primary) / 0.4)", strokeWidth: 1 }}
          />
          <Area type="monotone" dataKey="elev" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#elevGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ActivityDetail() {
  const { id } = useParams<{ id: string }>();
  const actId = Number(id);

  const { data: athlete } = useGetAthlete({ query: { queryKey: getGetAthleteQueryKey() } });
  const { data: activity, isLoading } = useGetActivity(actId, { query: { enabled: !!actId, queryKey: getGetActivityQueryKey(actId) } });
  const { data: streams } = useGetActivityStreams(actId, { query: { enabled: !!actId, queryKey: getGetActivityStreamsQueryKey(actId) } });

  const measurePref = athlete?.measurement_preference ?? "metric";

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!activity) {
    return <div className="text-muted-foreground py-16 text-center">Activity not found.</div>;
  }

  const stats = [
    { label: "Distance", value: formatDistance(activity.distance, measurePref), icon: Activity },
    { label: "Moving Time", value: formatDuration(activity.moving_time), icon: Timer },
    { label: activity.sport_type?.toLowerCase().includes("ride") ? "Average Speed" : "Pace", value: formatPace(activity.average_speed ?? 0, activity.sport_type, measurePref), icon: Wind },
    { label: "Elevation", value: formatElevation(activity.total_elevation_gain ?? 0, measurePref), icon: Mountain },
    { label: "Avg HR", value: activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : "—", icon: Heart },
    ...(activity.average_watts && !activity.sport_type?.toLowerCase().includes("run") ? [{ label: "Avg Power", value: `${Math.round(activity.average_watts)}W`, icon: Zap }] : []),
    ...(activity.kilojoules ? [{ label: "Energy", value: `${Math.round(activity.kilojoules)} kJ`, icon: Flame }] : []),
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link href="/activities" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to activities
        </Link>
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-md bg-muted mt-1 ${sportTypeColor(activity.sport_type)}`}>
            {(() => { const Icon = sportTypeIcon(activity.sport_type); return <Icon className="w-5 h-5" />; })()}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{activity.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm text-muted-foreground">
                {new Date(activity.start_date_local ?? activity.start_date).toLocaleDateString("en", {
                  weekday: "long", year: "numeric", month: "long", day: "numeric",
                })}
              </span>
              <Badge variant="secondary" className="text-xs">{activity.sport_type}</Badge>
              {activity.achievement_count != null && activity.achievement_count > 0 && (
                <Badge className="text-xs gap-1 bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                  <Trophy className="w-3 h-3" /> {activity.achievement_count} achievements
                </Badge>
              )}
            </div>
            {activity.description && (
              <p className="text-sm text-muted-foreground mt-2 max-w-prose">{activity.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <s.icon className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</span>
            </div>
            <p className="text-lg font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Map and Elevation */}
      <div className="grid md:grid-cols-2 gap-4">
        {streams?.latlng && streams.latlng.length > 1 && (
          <RouteMap latlng={streams.latlng} />
        )}
        {streams?.altitude && streams.distance && streams.altitude.length > 1 && (
          <ElevationChart altitude={streams.altitude} distance={streams.distance} measurePref={measurePref} />
        )}
      </div>

      {/* Laps */}
      {activity.laps && activity.laps.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Laps</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-5 py-2 text-left">Lap</th>
                  <th className="px-5 py-2 text-right">Distance</th>
                  <th className="px-5 py-2 text-right">Time</th>
                  <th className="px-5 py-2 text-right">Pace</th>
                  {activity.laps.some((l) => l.average_heartrate) && (
                    <th className="px-5 py-2 text-right">HR</th>
                  )}
                  {activity.laps.some((l) => l.average_watts) && (
                    <th className="px-5 py-2 text-right">Watts</th>
                  )}
                  <th className="px-5 py-2 text-right">Elev</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activity.laps.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/40 transition-colors text-foreground">
                    <td className="px-5 py-2.5 text-muted-foreground">{l.lap_index}</td>
                    <td className="px-5 py-2.5 text-right">{formatDistance(l.distance, measurePref)}</td>
                    <td className="px-5 py-2.5 text-right">{formatDurationShort(l.moving_time)}</td>
                    <td className="px-5 py-2.5 text-right">{formatPace(l.average_speed ?? 0, activity.sport_type, measurePref)}</td>
                    {activity.laps!.some((ll) => ll.average_heartrate) && (
                      <td className="px-5 py-2.5 text-right text-muted-foreground">
                        {l.average_heartrate ? Math.round(l.average_heartrate) : "—"}
                      </td>
                    )}
                    {activity.laps!.some((ll) => ll.average_watts) && (
                      <td className="px-5 py-2.5 text-right">
                        {l.average_watts ? `${Math.round(l.average_watts)}W` : "—"}
                      </td>
                    )}
                    <td className="px-5 py-2.5 text-right">
                      {l.total_elevation_gain != null ? `${Math.round(l.total_elevation_gain)}m` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

function formatDurationShort(seconds: number): string {
  if (!seconds) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
