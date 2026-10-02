import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber, type Stat } from "./api";

// Structured numbers become something readable: a few headline figures as
// cards, a series over time as a chart, and everything as a table that stays
// scrollable on a phone. Nothing here invents data: it only lays out the
// stats staff recorded.

type Series = { key: string; label: string; points: { x: string; value: number; unit: string | null }[] };

const sortKey = (s: Stat) => s.period_date ?? s.period_label ?? "";

/** Groups stats into series by their `series` name (points need a period). */
export function groupSeries(stats: Stat[]): Series[] {
  const map = new Map<string, Series>();
  for (const s of stats) {
    if (!s.series || !(s.period_label || s.period_date)) continue;
    const key = s.series;
    if (!map.has(key)) map.set(key, { key, label: s.series, points: [] });
    map.get(key)!.points.push({ x: s.period_label ?? String(new Date(s.period_date!).getFullYear()), value: Number(s.value), unit: s.unit });
  }
  for (const s of map.values()) s.points.sort((a, b) => a.x.localeCompare(b.x, undefined, { numeric: true }));
  return [...map.values()].filter((s) => s.points.length >= 2);
}

export function StatCards({ stats }: { stats: Stat[] }) {
  if (!stats.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((s) => (
        <div key={s.id} className="rounded-2xl border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
          <p className="mt-1 font-display text-3xl font-bold text-primary">
            {formatNumber(s.value)}{s.unit && <span className="ml-1 text-base font-semibold text-muted-foreground">{s.unit}</span>}
          </p>
          {(s.period_label || s.period_date) && <p className="mt-1 text-xs text-muted-foreground">{s.period_label ?? new Date(s.period_date!).getFullYear()}</p>}
        </div>
      ))}
    </div>
  );
}

export function SeriesChart({ series }: { series: Series }) {
  const data = series.points.map((p) => ({ x: p.x, value: p.value }));
  const unit = series.points[0]?.unit ?? "";
  const Chart = data.length <= 3 ? BarChart : LineChart;
  return (
    <figure className="rounded-2xl border bg-card p-4 sm:p-5">
      <figcaption className="mb-3 text-sm font-semibold">{series.label}{unit ? ` (${unit})` : ""}</figcaption>
      <div className="h-56 w-full sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
            <XAxis dataKey="x" tick={{ fontSize: 12 }} stroke="currentColor" opacity={0.6} />
            <YAxis tick={{ fontSize: 12 }} stroke="currentColor" opacity={0.6} width={48} tickFormatter={(v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
            <Tooltip formatter={(v: number) => [`${formatNumber(v)}${unit ? ` ${unit}` : ""}`, series.label]} contentStyle={{ borderRadius: 12 }} />
            {data.length <= 3 ? (
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            ) : (
              <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function StatsTable({ stats }: { stats: Stat[] }) {
  if (!stats.length) return null;
  const hasSeries = stats.some((s) => s.series);
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full min-w-[28rem] text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            {hasSeries && <th className="px-4 py-2.5">Series</th>}
            <th className="px-4 py-2.5">Indicator</th>
            <th className="px-4 py-2.5">Period</th>
            <th className="px-4 py-2.5 text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.id} className="border-t">
              {hasSeries && <td className="px-4 py-2 text-muted-foreground">{s.series ?? ""}</td>}
              <td className="px-4 py-2 font-medium">{s.label}</td>
              <td className="px-4 py-2 text-muted-foreground">{s.period_label ?? (s.period_date ? new Date(s.period_date).getFullYear() : "")}</td>
              <td className="px-4 py-2 text-right font-mono">{formatNumber(s.value)}{s.unit ? ` ${s.unit}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cards for single figures, charts for series over time, and the full table. */
export function StatsBlock({ stats }: { stats: Stat[] }) {
  const sorted = useMemo(() => [...stats].sort((a, b) => a.sort - b.sort || sortKey(a).localeCompare(sortKey(b))), [stats]);
  const series = useMemo(() => groupSeries(sorted), [sorted]);
  const inSeries = new Set(series.flatMap((s) => s.points.map((p) => `${s.key}|${p.x}`)));
  const singles = sorted.filter((s) => !(s.series && inSeries.has(`${s.series}|${s.period_label ?? (s.period_date ? String(new Date(s.period_date).getFullYear()) : "")}`)));
  if (!sorted.length) return null;
  return (
    <div className="space-y-4">
      {singles.length > 0 && singles.length <= 6 && <StatCards stats={singles} />}
      {series.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {series.map((s) => <SeriesChart key={s.key} series={s} />)}
        </div>
      )}
      {(sorted.length > 6 || series.length > 0) && <StatsTable stats={sorted} />}
    </div>
  );
}
