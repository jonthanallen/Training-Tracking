import { useParams, Link } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useGetAthlete, useGetActivity, useGetActivityStreams, getGetAthleteQueryKey, getGetActivityQueryKey, getGetActivityStreamsQueryKey } from "@workspace/api-client-react";
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { TooltipProps } from "recharts";
import { formatDistance, formatDuration, formatPace, formatElevation, sportTypeIcon, sportTypeColor } from "@/lib/utils-training";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChartTooltip } from "@/components/chart-tooltip";
import { ArrowLeft, Heart, Zap, Activity, Mountain, Timer, Flame, Trophy, Wind, ChevronDown } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function RouteMap({ latlng }: { latlng: number[][] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [collapsed, setCollapsed] = useState(false);

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
        reset.style.cssText = "width:26px;height:26px;cursor:pointer;background:#fff;border:none;display:flex;align-items:center;justify-content:center;color:#444;";
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

  useEffect(() => {
    if (!collapsed && mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 0);
    }
  }, [collapsed]);

  if (!latlng || latlng.length < 2) return null;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Route</h3>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`} />
      </button>
      <div style={{ display: collapsed ? "none" : "block" }}>
        <div ref={containerRef} style={{ height: 280 }} />
      </div>
    </div>
  );
}

type StreamSeries = { key: string; label: string; color: string };

const SERIES: StreamSeries[] = [
  { key: "elev",    label: "Elevation",  color: "hsl(220 10% 60%)" },
  { key: "hr",      label: "Heart Rate", color: "hsl(4 75% 57%)"   },
  { key: "speed",   label: "Speed",      color: "hsl(210 85% 60%)" },
  { key: "power",   label: "Power",      color: "hsl(45 90% 55%)"  },
  { key: "cadence", label: "Cadence",    color: "hsl(270 65% 65%)" },
];

function normalize(arr: number[], step: number): number[] {
  const sampled = arr.filter((_, i) => i % step === 0);
  const min = Math.min(...sampled), max = Math.max(...sampled);
  const range = max - min || 1;
  return sampled.map((v) => ((v - min) / range) * 100);
}

function ActivityChart({ streams, measurePref, sportType }: {
  streams: { altitude?: number[]; heartrate?: number[]; velocity_smooth?: number[]; watts?: number[]; cadence?: number[]; distance?: number[] };
  measurePref: string;
  sportType?: string;
}) {
  const isImperial = measurePref === "imperial";
  const isRide = sportType?.toLowerCase().includes("ride");

  const available: Record<string, boolean> = {
    elev:    !!(streams.altitude?.length),
    hr:      !!(streams.heartrate?.length),
    speed:   !!(streams.velocity_smooth?.length),
    power:   !!(streams.watts?.length),
    cadence: !!(streams.cadence?.length),
  };

  const [show, setShow] = useState<Record<string, boolean>>({ elev: true, hr: true, speed: !isRide, power: true, cadence: false });
  const toggle = (key: string) => setShow((s) => ({ ...s, [key]: !s[key] }));
  const [collapsed, setCollapsed] = useState(false);

  const n = streams.altitude?.length ?? streams.distance?.length ?? 0;
  const step = Math.max(1, Math.floor(n / 400));

  const elevNorm    = streams.altitude        ? normalize(streams.altitude,        step) : [];
  const hrNorm      = streams.heartrate       ? normalize(streams.heartrate,       step) : [];
  const speedNorm   = streams.velocity_smooth ? normalize(streams.velocity_smooth, step) : [];
  const powerNorm   = streams.watts           ? normalize(streams.watts,           step) : [];
  const cadenceNorm = streams.cadence         ? normalize(streams.cadence,         step) : [];

  const elevRaw    = streams.altitude?.filter((_, i) => i % step === 0)        ?? [];
  const hrRaw      = streams.heartrate?.filter((_, i) => i % step === 0)       ?? [];
  const speedRaw   = streams.velocity_smooth?.filter((_, i) => i % step === 0) ?? [];
  const powerRaw   = streams.watts?.filter((_, i) => i % step === 0)           ?? [];
  const cadenceRaw = streams.cadence?.filter((_, i) => i % step === 0)         ?? [];
  const distRaw    = streams.distance?.filter((_, i) => i % step === 0)        ?? [];

  const count = Math.max(elevNorm.length, hrNorm.length, speedNorm.length, powerNorm.length, cadenceNorm.length);
  const data = Array.from({ length: count }, (_, i) => {
    const distM = distRaw[i] ?? 0;
    return {
      dist: isImperial ? (distM * 0.000621371).toFixed(2) : (distM / 1000).toFixed(2),
      elev:    elevNorm[i],    _elev:    elevRaw[i],
      hr:      hrNorm[i],      _hr:      hrRaw[i],
      speed:   speedNorm[i],   _speed:   speedRaw[i],
      power:   powerNorm[i],   _power:   powerRaw[i],
      cadence: cadenceNorm[i], _cadence: cadenceRaw[i],
    };
  });

  function fmtTooltipVal(key: string, raw: number): string {
    if (key === "elev")    return isImperial ? `${Math.round(raw * 3.28084)} ft` : `${Math.round(raw)} m`;
    if (key === "hr")      return `${Math.round(raw)} bpm`;
    if (key === "speed")   return isRide
      ? (isImperial ? `${(raw * 2.23694).toFixed(1)} mph` : `${(raw * 3.6).toFixed(1)} km/h`)
      : (isImperial ? `${(26.8224 / raw).toFixed(2)} /mi` : `${(16.6667 / raw).toFixed(2)} /km`);
    if (key === "power")   return `${Math.round(raw)} W`;
    if (key === "cadence") return `${Math.round(raw)} rpm`;
    return String(raw);
  }

  const distSuffix = isImperial ? "mi" : "km";
  const visibleSeries = SERIES.filter((s) => available[s.key]);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity Chart</h3>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`} />
      </button>
      {!collapsed && <div className="px-4 pb-4">
      <div className="flex items-center justify-end mb-3 flex-wrap gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {visibleSeries.map((s) => (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-opacity"
              style={{
                borderColor: s.color,
                color: show[s.key] ? s.color : "hsl(var(--muted-foreground))",
                background: show[s.key] ? `color-mix(in srgb, ${s.color} 12%, transparent)` : "transparent",
                opacity: show[s.key] ? 1 : 0.5,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: show[s.key] ? s.color : "transparent", border: `2px solid ${s.color}`, display: "inline-block" }} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="elevGradGrey" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="hsl(220 10% 60%)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="hsl(220 10% 60%)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <XAxis dataKey="dist" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} hide />
          <Tooltip
            content={({ active, payload, label }: TooltipProps<number, string>) => {
              if (!active || !payload?.length) return null;
              const pt = payload[0]?.payload as Record<string, number>;
              return (
                <ChartTooltip
                  label={`${label} ${distSuffix}`}
                  lines={SERIES.filter((s) => available[s.key] && show[s.key] && pt[`_${s.key}`] != null).map((s) => ({
                    text: `${s.label}: ${fmtTooltipVal(s.key, pt[`_${s.key}`])}`,
                    color: s.color,
                  }))}
                />
              );
            }}
            cursor={{ stroke: "hsl(var(--muted-foreground) / 0.3)", strokeWidth: 1 }}
          />
          {show.elev && available.elev && (
            <Area type="monotone" dataKey="elev" stroke="hsl(220 10% 60%)" strokeWidth={1.5} fill="url(#elevGradGrey)" dot={false} />
          )}
          {show.hr && available.hr && (
            <Line type="monotone" dataKey="hr" stroke="hsl(4 75% 57%)" strokeWidth={1.5} dot={false} />
          )}
          {show.speed && available.speed && (
            <Line type="monotone" dataKey="speed" stroke="hsl(210 85% 60%)" strokeWidth={1.5} dot={false} />
          )}
          {show.power && available.power && (
            <Line type="monotone" dataKey="power" stroke="hsl(45 90% 55%)" strokeWidth={1.5} dot={false} />
          )}
          {show.cadence && available.cadence && (
            <Line type="monotone" dataKey="cadence" stroke="hsl(270 65% 65%)" strokeWidth={1.5} dot={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      </div>}
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
  const [lapsCollapsed, setLapsCollapsed] = useState(false);

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

      {/* Map */}
      {streams?.latlng && streams.latlng.length > 1 && (
        <RouteMap latlng={streams.latlng} />
      )}

      {/* Activity Chart */}
      {streams && (
        <ActivityChart streams={streams} measurePref={measurePref} sportType={activity.sport_type} />
      )}

      {/* Laps */}
      {activity.laps && activity.laps.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setLapsCollapsed((c) => !c)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Laps</h3>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${lapsCollapsed ? "-rotate-90" : ""}`} />
          </button>
          {!lapsCollapsed && <div className="overflow-x-auto">
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
          </div>}
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
