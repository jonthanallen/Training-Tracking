import { createElement, type SVGProps } from "react";
import { 
  Activity, 
  Bike, 
  Waves, 
  Dumbbell,
  type LucideIcon,
} from "lucide-react";

const RunnerIcon = (props: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) => {
  const { size = 24, strokeWidth = 2, className, ...rest } = props;
  return createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: size, height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
    ...rest,
  },
    createElement("circle", { cx: 13, cy: 4, r: 1.5 }),
    createElement("path", { d: "M12 6.5 L10 11" }),
    createElement("path", { d: "M11 8 L8 7" }),
    createElement("path", { d: "M11.5 8.5 L14 7" }),
    createElement("path", { d: "M10 11 L8 17" }),
    createElement("path", { d: "M10 11 L13 15 L17 13" }),
  );
};

export function formatDistance(meters: number, measurePref: string = 'metric'): string {
  if (!meters) return '0.0';
  if (measurePref === 'imperial') {
    return (meters * 0.000621371).toFixed(1) + ' mi';
  }
  return (meters / 1000).toFixed(1) + ' km';
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

export function formatDurationShort(seconds: number): string {
  if (!seconds) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatPace(metersPerSec: number, sportType: string, measurePref: string = 'metric'): string {
  if (!metersPerSec) return '0:00';
  
  const isRun = sportType.toLowerCase().includes('run') || sportType.toLowerCase().includes('walk');
  
  if (isRun) {
    // Pace in min/km or min/mi
    const metersPerUnit = measurePref === 'imperial' ? 1609.34 : 1000;
    const secondsPerUnit = metersPerUnit / metersPerSec;
    const mins = Math.floor(secondsPerUnit / 60);
    const secs = Math.floor(secondsPerUnit % 60);
    return `${mins}:${secs.toString().padStart(2, '0')} /${measurePref === 'imperial' ? 'mi' : 'km'}`;
  } else {
    // Speed in km/h or mph
    const kmh = metersPerSec * 3.6;
    if (measurePref === 'imperial') {
      const mph = kmh * 0.621371;
      return `${mph.toFixed(1)} mph`;
    }
    return `${kmh.toFixed(1)} km/h`;
  }
}

export function formatElevation(meters: number, measurePref: string = 'metric'): string {
  if (!meters) return '0 m';
  if (measurePref === 'imperial') {
    const feet = meters * 3.28084;
    return `${Math.round(feet).toLocaleString()} ft`;
  }
  return `${Math.round(meters).toLocaleString()} m`;
}

export function sportTypeIcon(sportType: string): LucideIcon {
  const t = sportType?.toLowerCase() || '';
  if (t.includes('run')) return RunnerIcon as unknown as LucideIcon;
  if (t.includes('ride') || t.includes('bike') || t.includes('cycl')) return Bike;
  if (t.includes('swim')) return Waves;
  if (t.includes('workout') || t.includes('weight') || t.includes('train')) return Dumbbell;
  return Activity;
}

export function sportTypeColor(sportType: string): string {
  const t = sportType?.toLowerCase() || '';
  if (t.includes('run')) return "text-[hsl(4_75%_57%)]";
  if (t.includes('ride') || t.includes('bike')) return "text-[hsl(145_70%_42%)]";
  if (t.includes('swim')) return "text-[hsl(207_90%_48%)]";
  if (t.includes('workout')) return "text-purple-500";
  return "text-muted-foreground";
}

export function heartRateZone(bpm: number, maxHR: number = 190): number {
  if (!bpm) return 0;
  const pct = bpm / maxHR;
  if (pct < 0.6) return 1;
  if (pct < 0.7) return 2;
  if (pct < 0.8) return 3;
  if (pct < 0.9) return 4;
  return 5;
}

export function hrZoneColor(zone: number): string {
  switch (zone) {
    case 1: return "text-gray-400 bg-gray-400/10";
    case 2: return "text-blue-400 bg-blue-400/10";
    case 3: return "text-green-400 bg-green-400/10";
    case 4: return "text-orange-400 bg-orange-400/10";
    case 5: return "text-red-500 bg-red-500/10";
    default: return "text-gray-400 bg-gray-400/10";
  }
}
