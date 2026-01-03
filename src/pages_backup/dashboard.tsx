// src/pages/dashboard.tsx
import { useEffect, useState } from "react";

type DayStat = { date: string; searches: number; votes: number };
type StatsResp = {
  ok: boolean;
  projectHost: string;
  totals: { searches: number; votes: number };
  days: DayStat[];
};

type RecentRow =
  | { type: "search"; id: string; created_at: string; prompt: string | null }
  | { type: "vote"; id: string; created_at: string; prompt: string | null; vote: "up" | "down" };

type RecentResp = { ok: boolean; projectHost: string; rows: RecentRow[] };

export default function Dashboard() {
  const [stats, setStats] = useState<StatsResp | null>(null);
  const [recent, setRecent] = useState<RecentResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, r] = await Promise.all([
          fetch("/api/admin_stats").then((x) => x.json()),
          fetch("/api/admin_recent").then((x) => x.json()),
        ]);
        setStats(s);
        setRecent(r);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main style={{ maxWidth: 960, margin: "2rem auto", padding: "0 1rem", lineHeight: 1.4 }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Founder Dashboard</h1>
      <div style={{ opacity: 0.75, marginBottom: 16 }}>
        {stats?.projectHost ? `Supabase Project: ${stats.projectHost}` : ""}
      </div>

      {loading && <div>Loading…</div>}

      {!loading && stats && (
        <>
          {/* Totals */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Searches (14 days)</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.totals.searches}</div>
            </div>
            <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Votes (14 days)</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.totals.votes}</div>
            </div>
          </div>

          {/* Daily table */}
          <h2 style={{ marginTop: 20, fontSize: 20 }}>Daily Activity (last 14 days)</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 4px" }}>Date (UTC)</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "8px 4px" }}>Searches</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "8px 4px" }}>Votes</th>
              </tr>
            </thead>
            <tbody>
              {stats.days.map((d) => (
                <tr key={d.date}>
                  <td style={{ padding: "6px 4px" }}>{d.date}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{d.searches}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{d.votes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!loading && recent && (
        <>
          <h2 style={{ marginTop: 24, fontSize: 20 }}>Recent Events</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 4px" }}>When (UTC)</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 4px" }}>Type</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 4px" }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {recent.rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: "6px 4px" }}>{row.created_at}</td>
                  <td style={{ padding: "6px 4px" }}>
                    {row.type === "search" ? "Search" : `Vote (${row.vote})`}
                  </td>
                  <td style={{ padding: "6px 4px", maxWidth: 640, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.prompt ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
