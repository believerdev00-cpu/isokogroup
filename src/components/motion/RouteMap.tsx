import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isLiteMotion } from "@/lib/motion";
import deliveryTruck from "@/assets/delivery-truck-marker.png";

type Stop = { label: string; x: number; y: number };

/**
 * A route between places with a marker travelling along it: a delivery on its
 * way (Logistics) or a journey through Rwanda (Travel). Drawn in SVG so it
 * scales without cost; in lite motion the marker simply sits at the end.
 * With `road` the route is drawn as an asphalt road for a vehicle to drive on.
 */
export default function RouteMap({
  stops, marker, road = false, className, lineClass = "text-primary", dotClass = "fill-primary", labelClass = "fill-foreground", duration = 7,
}: {
  stops: Stop[];
  /** What travels: an SVG node drawn around (0,0) */
  marker: ReactNode;
  road?: boolean;
  className?: string;
  lineClass?: string;
  dotClass?: string;
  labelClass?: string;
  duration?: number;
}) {
  const id = useId().replace(/:/g, "");
  const lite = isLiteMotion();
  // A smooth curve through the stops
  const d = stops
    .map((s, i) => {
      if (i === 0) return `M ${s.x} ${s.y}`;
      const p = stops[i - 1];
      const mx = (p.x + s.x) / 2;
      return `C ${mx} ${p.y}, ${mx} ${s.y}, ${s.x} ${s.y}`;
    })
    .join(" ");
  const end = stops[stops.length - 1];

  return (
    <svg viewBox="0 0 400 180" overflow="visible" className={cn("h-auto w-full", className)} role="img" aria-label={`Route: ${stops.map((s) => s.label).join(" to ")}`}>
      {road ? (
        <g fill="none" strokeLinecap="round">
          {/* Kerb, asphalt, white edge lines and a dashed centre line */}
          <path id={`route-${id}`} d={d} stroke="#71717a" strokeWidth={24} />
          <path d={d} stroke="#2e2e33" strokeWidth={22} />
          <path d={d} stroke="#f4f4f5" strokeWidth={18} />
          <path d={d} stroke="#2e2e33" strokeWidth={16} />
          <path d={d} stroke="#facc15" strokeWidth={1.4} strokeDasharray="7 6" strokeLinecap="butt" />
        </g>
      ) : (
        <>
          <path id={`route-${id}`} d={d} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={10} strokeLinecap="round" className={lineClass} />
          <path d={d} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className={cn(lineClass, "route-draw")} />
        </>
      )}
      {stops.map((s, i) => (
        <g key={s.label}>
          <circle cx={s.x} cy={s.y} r={i === 0 || i === stops.length - 1 ? 7 : 5} className={dotClass} />
          <circle cx={s.x} cy={s.y} r={i === 0 || i === stops.length - 1 ? 3 : 2} className="fill-background" />
          <text x={s.x} y={s.y + (s.y > 120 ? -16 : 24)} textAnchor="middle" className={cn("text-[11px] font-semibold", labelClass)}>
            {s.label}
          </text>
        </g>
      ))}
      <g transform={lite ? `translate(${end.x} ${end.y})` : undefined}>
        {marker}
        {!lite && (
          <animateMotion dur={`${duration}s`} repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.85;1" calcMode="spline" keySplines="0.22 1 0.36 1;0 0 1 1">
            <mpath href={`#route-${id}`} />
          </animateMotion>
        )}
      </g>
    </svg>
  );
}

/** An Isoko-branded delivery truck driving on the road (Logistics). */
export const TruckMarker = () => <image href={deliveryTruck} x={-55} y={-44} width={110} height={49} preserveAspectRatio="xMidYMax meet" />;

/** A small plane/car marker for travel journeys. */
export const PinMarker = ({ className = "fill-amber-400" }: { className?: string }) => (
  <g transform="translate(-9 -26)">
    <path d="M9 0C4 0 0 4 0 9c0 6.5 9 17 9 17s9-10.5 9-17c0-5-4-9-9-9z" className={className} />
    <circle cx="9" cy="9" r="3.5" className="fill-white" />
  </g>
);
