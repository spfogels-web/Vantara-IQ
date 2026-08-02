import { useState } from "react";
import {
  LayoutDashboard, FolderKanban, FileText, Users, Building2, Package,
  Wallet, Receipt, Sparkles, BarChart3, Settings, Search, Bell,
  MessageSquare, ChevronDown, ShieldCheck, TrendingUp, DollarSign,
  CheckCircle2, Clock, AlertTriangle, ArrowRight, Plus, Upload,
  FilePlus, UserRoundCog
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip
} from "recharts";

const nav = [
  { icon: LayoutDashboard, label: "Operations Center", active: true },
  { icon: FolderKanban, label: "Projects" },
  { icon: FileText, label: "Dailies" },
  { icon: Users, label: "Subcontractors" },
  { icon: Building2, label: "Customers" },
  { icon: Package, label: "Materials" },
  { icon: Wallet, label: "Billing" },
  { icon: Receipt, label: "Pay applications" },
  { icon: Sparkles, label: "AI assistant" },
  { icon: BarChart3, label: "Reports" },
];

// Two variants per accent: a darker base (icon chips, borders) and a
// brighter "text" tint (readable at small sizes against a near-black card).
const stats = [
  { icon: FolderKanban, label: "Active projects", value: "14", sub: "View all projects", accent: "#2F6690", text: "#7FB8E8" },
  { icon: TrendingUp, label: "Production today", value: "18,420 ft", sub: "Up 12% vs yesterday", accent: "#3E8A4E", text: "#7CD48F" },
  { icon: DollarSign, label: "Revenue ready to bill", value: "$482,350", sub: "4 invoices ready", accent: "#C6650F", text: "#F2A25F" },
  { icon: Receipt, label: "Approved pay apps", value: "$198,400", sub: "This month", accent: "#7566B8", text: "#B4A7EA" },
  { icon: Clock, label: "Dailies waiting", value: "12", sub: "Requires review", accent: "#B4930A", text: "#E8C84F" },
  { icon: AlertTriangle, label: "Projects at risk", value: "2", sub: "Behind schedule", accent: "#B0392E", text: "#F09488" },
];

const projects = [
  { name: "Windstream White Plains", loc: "White Plains, SC", status: "Behind schedule", tone: "danger", remaining: "42,100 ft", required: "3,850 ft/day", forecast: "4 days late", ftone: "danger", score: 61 },
  { name: "Commerce GA", loc: "Commerce, GA", status: "On schedule", tone: "info", remaining: "6,250 ft", required: "2,100 ft/day", forecast: "On track", ftone: "success", score: 92 },
  { name: "Piedmont Water", loc: "Greenville, SC", status: "Ahead of schedule", tone: "success", remaining: "1,800 ft", required: "1,450 ft/day", forecast: "5 days early", ftone: "success", score: 97 },
  { name: "AT&T Fiber Project", loc: "Spartanburg, SC", status: "On schedule", tone: "info", remaining: "12,340 ft", required: "2,300 ft/day", forecast: "On track", ftone: "success", score: 88 },
  { name: "Duke Energy Upgrade", loc: "Anderson, SC", status: "Behind schedule", tone: "danger", remaining: "8,900 ft", required: "1,600 ft/day", forecast: "2 days late", ftone: "danger", score: 68 },
];

const brief = [
  { icon: UserRoundCog, accent: "#B4930A", text: "#E8C84F", title: "Move crew 7 to White Plains", sub: "This will recover the schedule in 4 days" },
  { icon: TrendingUp, accent: "#3E8A4E", text: "#7CD48F", title: "5,200 ft remaining on Commerce project", sub: "On track to finish on May 24" },
  { icon: FileText, accent: "#B4930A", text: "#E8C84F", title: "3 subcontractors haven't submitted today's dailies", sub: "Send reminders or follow up" },
  { icon: Receipt, accent: "#2F6690", text: "#7FB8E8", title: "4 invoices are ready", sub: "$482,350 ready for customer billing" },
  { icon: ShieldCheck, accent: "#7566B8", text: "#B4A7EA", title: "2 insurance certificates expire in 12 days", sub: "View and take action" },
];

const deadlines = [
  { title: "Windstream White Plains", sub: "Milestone: directional drill · May 18", days: 2, accent: "#F09488" },
  { title: "Piedmont Water", sub: "As-built due · May 20", days: 4, accent: "#7CD48F" },
  { title: "Commerce GA", sub: "Submittal package · May 24", days: 8, accent: "#7FB8E8" },
];

const missingDocs = [
  { title: "Windstream White Plains", sub: "2 documents", count: 2 },
  { title: "AT&T Fiber Project", sub: "3 documents", count: 3 },
  { title: "Duke Energy Upgrade", sub: "1 document", count: 1 },
];

const crews = [
  { name: "Crew 1", status: "Available in 2 days", date: "May 15", tone: "muted" },
  { name: "Crew 2", status: "Available now", date: "Today", tone: "success" },
  { name: "Crew 7", status: "Available in 4 days", date: "May 17", tone: "muted" },
  { name: "Crew 3", status: "Busy", date: "—", tone: "warning" },
  { name: "Crew 4", status: "Available in 7 days", date: "May 20", tone: "muted" },
];

const notifications = [
  { text: "Daily from Crew 3 requires review", time: "10 minutes ago", accent: "#E8C84F" },
  { text: "New daily submitted on Piedmont Water", time: "1 hour ago", accent: "#7FB8E8" },
  { text: "Invoice #INV-00432 was approved", time: "2 hours ago", accent: "#7CD48F" },
  { text: "Subcontractor ABC Utilities added", time: "3 hours ago", accent: "#B4A7EA" },
];

const productionTrend = [
  { day: "Mon", ft: 14200 }, { day: "Tue", ft: 16800 }, { day: "Wed", ft: 12100 },
  { day: "Thu", ft: 19400 }, { day: "Fri", ft: 15600 }, { day: "Sat", ft: 17200 },
  { day: "Sun", ft: 18420 },
];

// Text-safe (bright) and background-tint (dim) pairs for status pills.
const toneText = { danger: "#F09488", info: "#8FC0EB", success: "#8FD79E", warning: "#EAD07A", muted: "#B7BCBE" };
const toneBg = { danger: "#3A2320", info: "#1E2B33", success: "#1D2E21", warning: "#332C18", muted: "#262C2F" };

const cardShadow = "0 2px 8px rgba(0,0,0,0.35)";
const cardStyle = { backgroundColor: "#1B2124", border: "1px solid #2A3236", boxShadow: cardShadow };

function scoreColor(s) {
  if (s >= 90) return "#5FBF74";
  if (s >= 70) return "#E0BB3D";
  return "#DC5A4C";
}

function HealthGauge({ score }) {
  const c = scoreColor(score);
  const r = 19, circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={r} fill="none" stroke="#2E3639" strokeWidth="4" />
      <circle
        cx="24" cy="24" r={r} fill="none" stroke={c} strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 24 24)"
      />
      <text x="24" y="28" textAnchor="middle" fontSize="13" fontWeight="700" fill={c} fontFamily="monospace">{score}</text>
    </svg>
  );
}

function StatusPill({ label, tone }) {
  return (
    <span
      className="text-[10px] uppercase tracking-wide font-bold px-2 py-1 rounded-sm inline-block whitespace-nowrap"
      style={{ color: toneText[tone], backgroundColor: toneBg[tone] }}
    >
      {label}
    </span>
  );
}

const tableCols = [
  { key: "project", label: "Project", width: 200 },
  { key: "status", label: "Status", width: 110 },
  { key: "remaining", label: "Remaining", width: 90 },
  { key: "required", label: "Req/day", width: 90 },
  { key: "forecast", label: "Forecast", width: 100 },
  { key: "health", label: "Health", width: 70 },
];
const tableMinWidth = tableCols.reduce((a, c) => a + c.width, 0);

export default function App() {
  const [active, setActive] = useState("Operations Center");
  return (
    <div className="w-full rounded-lg overflow-hidden border" style={{ borderColor: "#2A3236" }}>
      <div className="w-full flex" style={{ backgroundColor: "#12171A", minHeight: 720 }}>
        {/* Sidebar */}
        <aside className="w-56 shrink-0 flex flex-col border-r" style={{ backgroundColor: "#161C1F", borderColor: "#232A2D" }}>
          <div className="px-4 py-4 border-b flex items-center gap-2" style={{ borderColor: "#232A2D" }}>
            <div className="w-7 h-7 rounded-sm flex items-center justify-center shrink-0" style={{ backgroundColor: "#E8720C" }}>
              <ShieldCheck size={16} color="#12171A" strokeWidth={2.5} />
            </div>
            <span className="font-mono text-[12px] tracking-[0.15em] text-white font-semibold">VANTARA IQ</span>
          </div>

          <nav className="flex-1 py-2 overflow-auto">
            {nav.map((item) => {
              const isActive = active === item.label;
              return (
                <div
                  key={item.label}
                  onClick={() => setActive(item.label)}
                  className="flex items-center gap-3 px-4 py-2.5 mx-2 my-0.5 rounded-sm cursor-pointer text-sm"
                  style={{
                    backgroundColor: isActive ? "#26333A" : "transparent",
                    color: isActive ? "#FFFFFF" : "#A7ADB0",
                  }}
                >
                  <item.icon size={16} strokeWidth={2} color={isActive ? "#F2965A" : "#A7ADB0"} />
                  <span className="text-[12.5px] font-medium whitespace-nowrap">{item.label}</span>
                </div>
              );
            })}
            <div
              className="flex items-center gap-3 px-4 py-2.5 mx-2 my-0.5 rounded-sm cursor-pointer text-sm"
              style={{ color: "#A7ADB0" }}
            >
              <Settings size={16} strokeWidth={2} />
              <span className="text-[12.5px] font-medium">Settings</span>
            </div>
          </nav>

          <div className="mx-2 mb-3 p-3 rounded-md" style={{ backgroundColor: "#20292E", boxShadow: cardShadow }}>
            <p className="text-[10px] uppercase tracking-wide font-bold mb-2" style={{ color: "#A7ADB0" }}>Quick actions</p>
            <div className="flex flex-col gap-2">
              {[
                { icon: FilePlus, label: "New daily" },
                { icon: Plus, label: "New project" },
                { icon: Upload, label: "Upload document" },
                { icon: Receipt, label: "Create invoice" },
              ].map((a) => (
                <div key={a.label} className="flex items-center gap-2 text-[11.5px]" style={{ color: "#DADDDE" }}>
                  <a.icon size={13} color="#F2965A" />
                  {a.label}
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 py-3 border-t flex items-center justify-between" style={{ borderColor: "#232A2D" }}>
            <div>
              <p className="text-[12px] font-semibold text-white">Fortitude Infrastructure</p>
              <p className="text-[10px]" style={{ color: "#8F969B" }}>Organization admin</p>
            </div>
            <ChevronDown size={13} color="#8F969B" />
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="h-14 flex items-center justify-between px-6 border-b shrink-0" style={{ borderColor: "#232A2D" }}>
            <span className="text-[15px] font-semibold text-white whitespace-nowrap">Operations Center</span>
            <div className="flex items-center gap-3 flex-1 max-w-md mx-6">
              <div className="flex items-center gap-2 rounded-sm px-3 py-1.5 w-full" style={{ backgroundColor: "#20272A" }}>
                <Search size={14} color="#8F969B" />
                <span className="text-[12px] whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: "#8F969B" }}>Search projects, dailies, crews, documents…</span>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="relative">
                <Bell size={17} color="#DADDDE" />
                <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center" style={{ backgroundColor: "#DC5A4C", color: "#fff" }}>8</span>
              </div>
              <MessageSquare size={17} color="#DADDDE" />
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0" style={{ backgroundColor: "#2F6690", color: "#fff" }}>JS</div>
                <div>
                  <p className="text-[12px] font-semibold text-white leading-tight whitespace-nowrap">John Smith</p>
                  <p className="text-[10px] leading-tight whitespace-nowrap" style={{ color: "#8F969B" }}>Administrator</p>
                </div>
                <ChevronDown size={13} color="#8F969B" />
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-5">
            {/* Stat cards */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-md p-3 flex flex-col justify-between"
                  style={{ backgroundColor: `${s.accent}22`, border: `1px solid ${s.accent}55`, boxShadow: cardShadow, minHeight: 108 }}
                >
                  <div>
                    <div className="w-6 h-6 rounded-sm flex items-center justify-center mb-2" style={{ backgroundColor: `${s.accent}55` }}>
                      <s.icon size={13} color="#fff" />
                    </div>
                    <p className="text-[9.5px] uppercase tracking-wide font-bold leading-snug" style={{ color: "#E3E5E6" }}>{s.label}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[18px] font-bold leading-tight text-white mt-1">{s.value}</p>
                    <p className="text-[10px] mt-0.5 font-medium" style={{ color: s.text }}>{s.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 mb-3 grid-cols-1 xl:grid-cols-[1.6fr_1fr_0.9fr]">
              {/* Projects requiring attention */}
              <div className="rounded-md" style={cardStyle}>
                <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: "#232A2D" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-white whitespace-nowrap">Projects requiring attention</span>
                    <span className="text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0" style={{ backgroundColor: "#DC5A4C", color: "#fff" }}>2</span>
                  </div>
                  <span className="text-[11px] flex items-center gap-1 whitespace-nowrap" style={{ color: "#8FC0EB" }}>View all <ArrowRight size={11} /></span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ tableLayout: "fixed", minWidth: tableMinWidth, width: "100%", borderCollapse: "collapse" }}>
                    <colgroup>
                      {tableCols.map((c) => <col key={c.key} style={{ width: c.width }} />)}
                    </colgroup>
                    <thead>
                      <tr className="text-[9.5px] uppercase tracking-wide" style={{ color: "#9CA2A5" }}>
                        {tableCols.map((c, i) => (
                          <th
                            key={c.key}
                            className="font-bold py-2 whitespace-nowrap"
                            style={{ paddingLeft: i === 0 ? 16 : 8, paddingRight: 8, textAlign: c.key === "health" ? "right" : "left" }}
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((p) => (
                        <tr key={p.name} className="border-t" style={{ borderColor: "#232A2D" }}>
                          <td className="py-2.5 pl-4 pr-2 overflow-hidden">
                            <p className="text-[12px] font-semibold text-white truncate">{p.name}</p>
                            <p className="text-[10px] truncate" style={{ color: "#8F969B" }}>{p.loc}</p>
                          </td>
                          <td className="py-2.5 px-2"><StatusPill label={p.status} tone={p.tone} /></td>
                          <td className="py-2.5 px-2 font-mono text-[11.5px] whitespace-nowrap" style={{ color: "#DADDDE" }}>{p.remaining}</td>
                          <td className="py-2.5 px-2 font-mono text-[11.5px] whitespace-nowrap" style={{ color: "#DADDDE" }}>{p.required}</td>
                          <td className="py-2.5 px-2 text-[11.5px] font-semibold whitespace-nowrap" style={{ color: toneText[p.ftone] }}>{p.forecast}</td>
                          <td className="py-2 pr-4 pl-2"><div className="flex justify-end"><HealthGauge score={p.score} /></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* AI Operations Brief */}
              <div className="rounded-md" style={cardStyle}>
                <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "#232A2D" }}>
                  <Sparkles size={14} color="#B4A7EA" />
                  <span className="text-[13px] font-semibold text-white whitespace-nowrap">AI operations brief</span>
                </div>
                <div className="p-2.5 flex flex-col gap-1.5">
                  {brief.map((b, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-2 rounded-sm cursor-pointer" style={{ backgroundColor: "#20272A" }}>
                      <div className="w-6 h-6 rounded-sm flex items-center justify-center shrink-0" style={{ backgroundColor: `${b.accent}55` }}>
                        <b.icon size={13} color="#fff" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11.5px] font-semibold text-white leading-snug">{b.title}</p>
                        <p className="text-[10.5px] leading-snug" style={{ color: "#B7BCBE" }}>{b.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right column: deadlines + missing docs */}
              <div className="flex flex-col gap-3">
                <div className="rounded-md" style={cardStyle}>
                  <div className="px-3.5 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "#232A2D" }}>
                    <span className="text-[12px] font-semibold text-white whitespace-nowrap">Upcoming deadlines</span>
                    <span className="text-[10px] whitespace-nowrap" style={{ color: "#8FC0EB" }}>View all</span>
                  </div>
                  <div className="p-2.5 flex flex-col gap-2.5">
                    {deadlines.map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: d.accent }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-white truncate">{d.title}</p>
                          <p className="text-[9.5px] truncate" style={{ color: "#8F969B" }}>{d.sub}</p>
                        </div>
                        <div className="text-right shrink-0 pl-1">
                          <p className="font-mono text-[13px] font-bold" style={{ color: d.accent }}>{d.days}</p>
                          <p className="text-[8px] uppercase" style={{ color: "#8F969B" }}>days</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md" style={cardStyle}>
                  <div className="px-3.5 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "#232A2D" }}>
                    <span className="text-[12px] font-semibold text-white whitespace-nowrap">Missing documents</span>
                    <span className="text-[10px] whitespace-nowrap" style={{ color: "#8FC0EB" }}>View all</span>
                  </div>
                  <div className="p-2.5 flex flex-col gap-2.5">
                    {missingDocs.map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <FileText size={13} color="#F2965A" className="shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-white truncate">{d.title}</p>
                          <p className="text-[9.5px] truncate" style={{ color: "#8F969B" }}>{d.sub}</p>
                        </div>
                        <span className="text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0" style={{ backgroundColor: "#DC5A4C", color: "#fff" }}>{d.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr_0.9fr]">
              {/* Production trend */}
              <div className="rounded-md p-4" style={cardStyle}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-semibold text-white whitespace-nowrap">Daily production trend</span>
                  <span className="text-[10px] flex items-center gap-1 whitespace-nowrap" style={{ color: "#B7BCBE" }}>7 days <ChevronDown size={11} /></span>
                </div>
                <div style={{ height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={productionTrend} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="#232A2D" vertical={false} />
                      <XAxis dataKey="day" stroke="#9CA2A5" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#9CA2A5" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#20272A", border: "1px solid #2A3236", borderRadius: 6, fontSize: 11, color: "#fff" }}
                        labelStyle={{ color: "#fff" }}
                        itemStyle={{ color: "#F2965A" }}
                        formatter={(v) => [`${v.toLocaleString()} ft`, "Production"]}
                      />
                      <Line type="monotone" dataKey="ft" stroke="#F2965A" strokeWidth={2} dot={{ r: 3, fill: "#F2965A" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Project health */}
              <div className="rounded-md p-4" style={cardStyle}>
                <span className="text-[13px] font-semibold text-white whitespace-nowrap">Project health</span>
                <div className="flex flex-col gap-3 mt-3">
                  {[
                    { label: "On schedule", n: 8, total: 14, c: "#5FBF74" },
                    { label: "Ahead of schedule", n: 3, total: 14, c: "#4FC9AE" },
                    { label: "At risk", n: 2, total: 14, c: "#E0BB3D" },
                    { label: "Behind schedule", n: 1, total: 14, c: "#DC5A4C" },
                  ].map((r) => (
                    <div key={r.label}>
                      <div className="flex justify-between text-[10.5px] mb-1">
                        <span style={{ color: "#DADDDE" }}>{r.label}</span>
                        <span className="font-mono font-bold" style={{ color: "#fff" }}>{r.n}</span>
                      </div>
                      <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: "#2A3236" }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${(r.n / r.total) * 100}%`, backgroundColor: r.c }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Crew availability */}
              <div className="rounded-md" style={cardStyle}>
                <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#232A2D" }}>
                  <span className="text-[13px] font-semibold text-white whitespace-nowrap">Crew availability</span>
                  <span className="text-[10px] whitespace-nowrap" style={{ color: "#8F969B" }}>Next 14 days</span>
                </div>
                <div className="p-3 flex flex-col gap-2.5">
                  {crews.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-[11px] gap-2">
                      <span className="whitespace-nowrap" style={{ color: "#DADDDE" }}>{c.name}</span>
                      <span className="font-medium whitespace-nowrap" style={{ color: toneText[c.tone] }}>{c.status}</span>
                      <span className="font-mono whitespace-nowrap" style={{ color: "#8F969B" }}>{c.date}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notifications */}
              <div className="rounded-md" style={cardStyle}>
                <div className="px-3.5 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "#232A2D" }}>
                  <span className="text-[12px] font-semibold text-white whitespace-nowrap">Notifications</span>
                  <span className="text-[10px] whitespace-nowrap" style={{ color: "#8FC0EB" }}>View all</span>
                </div>
                <div className="p-2.5 flex flex-col gap-3">
                  {notifications.map((n, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: n.accent }} />
                      <div>
                        <p className="text-[10.5px] leading-snug" style={{ color: "#DADDDE" }}>{n.text}</p>
                        <p className="text-[9px]" style={{ color: "#8F969B" }}>{n.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>

          {/* Footer status bar */}
          <footer className="h-8 flex items-center justify-between px-5 border-t shrink-0" style={{ borderColor: "#232A2D", backgroundColor: "#161C1F" }}>
            <span className="text-[10px] whitespace-nowrap" style={{ color: "#8F969B" }}>Data updated 5 minutes ago</span>
            <div className="flex items-center gap-4 text-[10px] whitespace-nowrap" style={{ color: "#8F969B" }}>
              <span>72°F sunny</span>
              <span>Safety incident free: 145 days</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "#5FBF74" }} />All systems operational</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
