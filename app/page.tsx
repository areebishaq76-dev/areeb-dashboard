"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

interface Task { id: string; text: string; done: boolean; priority: "urgent" | "normal"; date: string; }
interface Job { id: string; link: string; note: string; status: "Shortlisted" | "Proposal Sent" | "Rejected" | "New"; }
interface TeamTask { id: string; text: string; assignee: string; done: boolean; }
interface Goal { id: string; text: string; done: boolean; }

const QUOTES = [
  { text: "Small daily improvements lead to stunning long-term results.", author: "Robin Sharma" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { text: "Your work is your signature. Make it count.", author: "" },
  { text: "One focused hour beats three distracted ones.", author: "" },
  { text: "Discipline is choosing what you want most over what you want now.", author: "" },
];

const todayKey = () => new Date().toISOString().split("T")[0];
const getWeekKey = () => {
  const d = new Date();
  const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  return mon.toISOString().split("T")[0];
};

export default function Dashboard() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Auth state ──
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState("You");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { window.location.href = "/login"; return; }
      setUserId(user.id);
      const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
      if (profile) setUsername(profile.username);
      await loadAllData(user.id);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAllData(uid: string) {
    const today = todayKey();
    const week = getWeekKey();
    const [{ data: t }, { data: tt }, { data: g }, { data: j }, { data: m }, { data: n }] = await Promise.all([
      supabase.from("tasks").select("*").eq("user_id", uid).eq("deleted", false).eq("date", today),
      supabase.from("team_tasks").select("*").eq("user_id", uid).eq("deleted", false),
      supabase.from("goals").select("*").eq("user_id", uid).eq("deleted", false).eq("week", week),
      supabase.from("jobs").select("*").eq("user_id", uid).eq("deleted", false),
      supabase.from("members").select("*").eq("user_id", uid),
      supabase.from("notes").select("*").eq("user_id", uid).eq("date", today).single(),
    ]);
    if (t) setTasks(t);
    if (tt) setTeamTasks(tt);
    if (g) setGoals(g);
    if (j) setJobs(j);
    if (m) setMembers(m.map((x: { name: string }) => x.name));
    if (n) setNoteContent(n.content);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // ── Shared state ──
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newPriority, setNewPriority] = useState<"urgent" | "normal">("normal");
  const urgentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  function scheduleUrgentReminder(id: string, text: string) {
    // Cancel any existing timer for this task
    if (urgentTimers.current[id]) clearTimeout(urgentTimers.current[id]);
    urgentTimers.current[id] = setTimeout(() => {
      // Only fire if task still exists and is not done
      setTasks(prev => {
        const task = prev.find(t => t.id === id);
        if (task && !task.done && task.priority === "urgent") {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("🔴 Urgent Task Reminder", {
              body: `"${text}" is still pending after 30 minutes!`,
              icon: "/favicon.ico",
            });
          }
        }
        return prev;
      });
    }, 30 * 60 * 1000); // 30 minutes
  }

  function cancelUrgentReminder(id: string) {
    if (urgentTimers.current[id]) {
      clearTimeout(urgentTimers.current[id]);
      delete urgentTimers.current[id];
    }
  }

  async function addTask(text = newTask, p = newPriority) {
    if (!text.trim() || !userId) return;
    const { data } = await supabase.from("tasks").insert({ user_id: userId, text: text.trim(), priority: p, date: todayKey(), done: false }).select().single();
    if (data) {
      setTasks(prev => [...prev, data]);
      if (p === "urgent") { requestNotificationPermission(); scheduleUrgentReminder(data.id, data.text); }
    }
    setNewTask(""); setNewPriority("normal");
  }
  async function toggleTask(id: string) {
    const task = tasks.find(x => x.id === id); if (!task) return;
    const done = !task.done;
    await supabase.from("tasks").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", id);
    setTasks(t => t.map(x => x.id === id ? { ...x, done } : x));
    if (done) cancelUrgentReminder(id);
    else if (task.priority === "urgent") scheduleUrgentReminder(id, task.text);
  }
  async function deleteTask(id: string) {
    cancelUrgentReminder(id);
    await supabase.from("tasks").update({ deleted: true }).eq("id", id);
    setTasks(t => t.filter(x => x.id !== id));
  }

  useEffect(() => {
    requestNotificationPermission();
    return () => { Object.values(urgentTimers.current).forEach(clearTimeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [newJobLink, setNewJobLink] = useState("");
  const [newJobNote, setNewJobNote] = useState("");
  async function addJob() {
    if (!newJobLink.trim() || !userId) return;
    const { data } = await supabase.from("jobs").insert({ user_id: userId, link: newJobLink.trim(), note: newJobNote.trim(), status: "New" }).select().single();
    if (data) setJobs(prev => [...prev, data]);
    setNewJobLink(""); setNewJobNote("");
  }
  async function updateJobStatus(id: string, status: Job["status"]) {
    await supabase.from("jobs").update({ status }).eq("id", id);
    setJobs(j => j.map(x => x.id === id ? { ...x, status } : x));
  }
  async function deleteJob(id: string) {
    await supabase.from("jobs").update({ deleted: true }).eq("id", id);
    setJobs(j => j.filter(x => x.id !== id));
  }

  const [teamTasks, setTeamTasks] = useState<TeamTask[]>([]);
  const [newTeamTask, setNewTeamTask] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [newMember, setNewMember] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  async function addMember() {
    if (!newMember.trim() || members.includes(newMember.trim()) || !userId) return;
    await supabase.from("members").insert({ user_id: userId, name: newMember.trim() });
    setMembers(m => [...m, newMember.trim()]); setNewMember(""); setShowAddMember(false);
  }
  async function removeMember(name: string) {
    await supabase.from("members").delete().eq("user_id", userId).eq("name", name);
    setMembers(m => m.filter(x => x !== name)); if (newAssignee === name) setNewAssignee("");
  }
  async function addTeamTask() {
    if (!newTeamTask.trim() || !newAssignee || !userId) return;
    const { data } = await supabase.from("team_tasks").insert({ user_id: userId, text: newTeamTask.trim(), assignee: newAssignee, done: false }).select().single();
    if (data) setTeamTasks(prev => [...prev, data]);
    setNewTeamTask("");
  }
  async function toggleTeamTask(id: string) {
    const task = teamTasks.find(x => x.id === id); if (!task) return;
    const done = !task.done;
    await supabase.from("team_tasks").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", id);
    setTeamTasks(t => t.map(x => x.id === id ? { ...x, done } : x));
  }
  async function deleteTeamTask(id: string) {
    await supabase.from("team_tasks").update({ deleted: true }).eq("id", id);
    setTeamTasks(t => t.filter(x => x.id !== id));
  }

  const [goals, setGoals] = useState<Goal[]>([]);
  const [newGoal, setNewGoal] = useState("");
  async function addGoal() {
    if (!newGoal.trim() || !userId) return;
    const { data } = await supabase.from("goals").insert({ user_id: userId, text: newGoal.trim(), done: false, week: getWeekKey() }).select().single();
    if (data) setGoals(prev => [...prev, data]);
    setNewGoal("");
  }
  async function toggleGoal(id: string) {
    const goal = goals.find(x => x.id === id); if (!goal) return;
    const done = !goal.done;
    await supabase.from("goals").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", id);
    setGoals(g => g.map(x => x.id === id ? { ...x, done } : x));
  }
  async function deleteGoal(id: string) {
    await supabase.from("goals").update({ deleted: true }).eq("id", id);
    setGoals(g => g.filter(x => x.id !== id));
  }

  // ── Notes state ──
  const [noteContent, setNoteContent] = useState("");
  async function saveNote(content: string) {
    if (!userId) return;
    setNoteContent(content);
    await supabase.from("notes").upsert({ user_id: userId, content, date: todayKey(), updated_at: new Date().toISOString() }, { onConflict: "user_id,date" });
  }

  const [activePage, setActivePage] = useState("Dashboard");


  // ── Derived stats ──
  const doneTasks = tasks.filter(t => t.done).length;
  const urgentTasks = tasks.filter(t => t.priority === "urgent" && !t.done).length;
  const doneTeamTasks = teamTasks.filter(t => t.done).length;
  const doneGoals = goals.filter(g => g.done).length;
  const taskPct = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0;
  const goalPct = goals.length ? Math.round((doneGoals / goals.length) * 100) : 0;


  const greeting = time.getHours() < 12 ? "Good morning" : time.getHours() < 17 ? "Good afternoon" : "Good evening";
  const quote = QUOTES[new Date().getDate() % QUOTES.length];

  const navItems = [
    { icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>, label: "Dashboard" },
    { icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>, label: "My Tasks" },
    { icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>, label: "Team Tasks" },
    { icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>, label: "Upwork Jobs" },
    { icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>, label: "Weekly Goals" },
    { icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>, label: "Notes" },
  ];

  // ── Reusable styles ──
  const inp = (forceDark = false) => ({
    background: forceDark ? "rgba(255,255,255,0.07)" : "#f0ebe3",
    border: `1px solid ${forceDark ? "rgba(255,255,255,0.1)" : "#e8e2d9"}`,
    color: forceDark ? "#fff" : "#1a1a2e",
    borderRadius: 12, padding: "6px 12px", fontSize: 12, outline: "none", width: "100%",
  });


  if (loading) return (
    <div className="flex h-screen items-center justify-center" style={{ background: "#0f1419", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div className="text-center">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black mx-auto mb-4"
          style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
          <span style={{ color: "#fff" }}>CS</span>
        </div>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Loading your dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="app-wrapper flex h-screen overflow-hidden" style={{ background: "#eef0f5", fontFamily: "'Inter', -apple-system, sans-serif" }}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      * { box-sizing: border-box; }
      .nav-btn { transition: background 0.15s ease; cursor: pointer; }
      .nav-btn:not(.nav-active):hover { background: rgba(255,255,255,0.07) !important; }
      .hov-card { transition: box-shadow 0.15s ease; }
      .hov-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.1) !important; }
      [contenteditable]:empty:before { content: attr(data-placeholder); color: #a09080; pointer-events: none; }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
      @media (max-width: 767px) {
        .desktop-only { display: none !important; }
        .dash-grid { display: flex !important; flex-direction: column !important; gap: 16px !important; }
        .main-grid { display: flex !important; flex-direction: column !important; gap: 16px !important; }
        .page-content { overflow-y: auto !important; }
      }
      @media (min-width: 768px) {
        .mobile-only { display: none !important; }
      }
    `}</style>

      {/* ══════════════ SIDEBAR (desktop only) ══════════════ */}
      <aside className="desktop-only w-[220px] shrink-0 flex flex-col" style={{ background: "#0f1419", borderRight: "1px solid rgba(255,255,255,0.06)" }}>

        {/* Brand */}
        <div className="px-5 pt-6 pb-5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow: "0 4px 12px rgba(99,102,241,0.4)" }}>
            <span style={{ color: "#fff" }}>CS</span>
          </div>
          <div>
            <p className="text-[13px] font-bold leading-none" style={{ color: "#fff" }}>CodesSavvy</p>
            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>Management</p>
          </div>
        </div>

        {/* Profile */}
        <div className="mx-3 mb-5 rounded-xl p-3 flex items-center gap-2.5" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black"
              style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
              <span style={{ color: "#fff" }}>{username[0]?.toUpperCase() || "?"}</span>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: "#22c55e", border: "1.5px solid #0f1419" }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold leading-none truncate" style={{ color: "#fff" }}>{username}</p>
            <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Team Member</p>
          </div>
          <button onClick={signOut} title="Sign out" className="shrink-0 opacity-40 hover:opacity-100 transition-opacity">
            <svg width="14" height="14" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>

        {/* Nav label */}
        <p className="px-5 mb-1 text-[9px] font-bold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.2)" }}>Navigation</p>

        {/* Nav items */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => {
            const badge =
              item.label === "My Tasks" ? urgentTasks :
              item.label === "Upwork Jobs" ? jobs.length :
              item.label === "Team Tasks" ? teamTasks.filter(t => !t.done).length :
              item.label === "Weekly Goals" ? goals.filter(g => !g.done).length : 0;
            const active = activePage === item.label;
            return (
              <button key={item.label} onClick={() => setActivePage(item.label)}
                className={`nav-btn${active ? " nav-active" : ""} w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer`}
                style={active
                  ? { background: "rgba(99,102,241,0.2)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }
                  : { color: "rgba(255,255,255,0.45)", background: "transparent", border: "1px solid transparent" }}>
                <span style={{ color: active ? "#a5b4fc" : "rgba(255,255,255,0.3)" }}>{item.icon}</span>
                <span className="text-[12px] font-medium">{item.label}</span>
                {badge > 0 && (
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                    style={{ background: active ? "rgba(99,102,241,0.4)" : "rgba(239,68,68,0.9)", color: "#fff" }}>{badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Clock */}
        <div className="m-3 mt-2 rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-[18px] font-black font-mono leading-none" style={{ color: "#fff" }}>
            {time.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-[9px] mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>Pakistan Standard Time</p>
        </div>
      </aside>

      {/* ══════════════ PAGE CONTENT ══════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: "#eef0f5" }}>
      {/* Mobile bottom nav */}
      <nav className="mobile-only fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-2" style={{ background: "#0f1419", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        {navItems.map(item => {
          const active = activePage === item.label;
          return (
            <button key={item.label} onClick={() => setActivePage(item.label)} className="flex flex-col items-center gap-1 px-2 py-1 rounded-xl"
              style={{ color: active ? "#a5b4fc" : "rgba(255,255,255,0.35)", minWidth: 44 }}>
              <span style={{ color: active ? "#a5b4fc" : "rgba(255,255,255,0.3)" }}>{item.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 700 }}>{item.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </nav>

        {/* ── Top header ── */}
        <header className="shrink-0 px-4 md:px-7 pt-4 md:pt-6 pb-3 md:pb-4 flex items-center justify-between" style={{ background: "#eef0f5" }}>
          <div className="min-w-0 flex-1 pr-3">
            <p className="hidden md:block text-[11px] font-medium mb-1" style={{ color: "#a09080", letterSpacing: "0.02em" }}>
              {time.toLocaleDateString("en-PK", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
            <h1 className="text-[18px] md:text-[24px] font-black leading-none tracking-tight truncate" style={{ color: "#1a1a2e" }}>
              {activePage === "Dashboard" ? `${greeting}, ${username} 👋` : activePage}
            </h1>
            <p className="hidden md:block text-[12px] mt-1.5" style={{ color: "#a09080" }}>
              {activePage === "Dashboard" && "Here's your operational overview for today"}
              {activePage === "My Tasks" && "Track and prioritize your personal tasks"}
              {activePage === "Team Tasks" && "Assign and monitor tasks across the team"}
              {activePage === "Upwork Jobs" && "Track shortlisted jobs through your proposal pipeline"}
              {activePage === "Weekly Goals" && "Set and track your goals for the week"}
              {activePage === "Notes" && "Daily reminders, follow-ups, and meeting notes"}
            </p>
          </div>
          {/* Live time badge */}
          <div className="rounded-2xl px-4 py-2.5 shrink-0" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p className="text-[11px] font-semibold" style={{ color: "#a09080" }}>Today</p>
            <p className="text-[18px] font-black font-mono leading-tight" style={{ color: "#1a1a2e" }}>
              {time.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </header>

        {/* ══════════════ DASHBOARD PAGE ══════════════ */}
        {activePage === "Dashboard" && (
          <div className="dash-grid page-content flex-1 overflow-y-auto px-4 md:px-7 pb-20 md:pb-6" style={{ background: "#eef0f5" }}>

            {/* ── Stat cards row ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  label: "Tasks Done",
                  value: `${doneTasks}/${tasks.length}`,
                  sub: `${taskPct}% complete`,
                  bg: "linear-gradient(135deg,#6366f1 0%,#4f46e5 100%)",
                  accent: "rgba(255,255,255,0.25)",
                  numColor: "#fff",
                  subColor: "rgba(255,255,255,0.7)",
                  bar: taskPct, barBg: "rgba(255,255,255,0.2)", barFill: "#fff",
                  icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>,
                },
                {
                  label: "Urgent Tasks",
                  value: urgentTasks,
                  sub: urgentTasks > 0 ? "Need attention now" : "All clear!",
                  bg: urgentTasks > 0 ? "linear-gradient(135deg,#ef4444 0%,#dc2626 100%)" : "linear-gradient(135deg,#22c55e 0%,#16a34a 100%)",
                  accent: "rgba(255,255,255,0.25)",
                  numColor: "#fff",
                  subColor: "rgba(255,255,255,0.7)",
                  bar: null, barBg: "", barFill: "",
                  icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
                },
                {
                  label: "Team Tasks",
                  value: `${doneTeamTasks}/${teamTasks.length}`,
                  sub: `${teamTasks.filter(t=>!t.done).length} pending`,
                  bg: "linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)",
                  accent: "rgba(255,255,255,0.25)",
                  numColor: "#fff",
                  subColor: "rgba(255,255,255,0.7)",
                  bar: teamTasks.length ? Math.round((doneTeamTasks/teamTasks.length)*100) : 0, barBg: "rgba(255,255,255,0.2)", barFill: "#fff",
                  icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
                },
                {
                  label: "Weekly Goals",
                  value: `${doneGoals}/${goals.length}`,
                  sub: `${goalPct}% achieved`,
                  bg: "linear-gradient(135deg,#f59e0b 0%,#d97706 100%)",
                  accent: "rgba(255,255,255,0.25)",
                  numColor: "#fff",
                  subColor: "rgba(255,255,255,0.7)",
                  bar: goalPct, barBg: "rgba(255,255,255,0.2)", barFill: "#fff",
                  icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
                },
              ].map(s => (
                <div key={s.label} className="hov-card rounded-2xl px-5 py-4 relative overflow-hidden"
                  style={{ background: s.bg, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                  {/* Decorative circle */}
                  <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <div className="absolute -bottom-6 -right-2 w-16 h-16 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
                  {/* Icon */}
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3 relative" style={{ background: "rgba(255,255,255,0.18)", color: "#fff" }}>
                    {s.icon}
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5 relative" style={{ color: "rgba(255,255,255,0.65)" }}>{s.label}</p>
                  <p className="text-[28px] font-black leading-none tracking-tight mb-1 relative" style={{ color: s.numColor }}>{s.value}</p>
                  <p className="text-[11px] font-medium mb-3 relative" style={{ color: s.subColor }}>{s.sub}</p>
                  {s.bar !== null && (
                    <div className="w-full rounded-full h-1 relative" style={{ background: s.barBg }}>
                      <div className="h-1 rounded-full transition-all duration-500" style={{ width: `${s.bar}%`, background: s.barFill }} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── Quote strip ── */}
            <div className="rounded-2xl px-5 py-3.5 flex items-center gap-4 relative overflow-hidden"
              style={{ background: "linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
              <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full" style={{ background: "rgba(99,102,241,0.1)" }} />
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm" style={{ background: "rgba(245,200,66,0.15)", border: "1px solid rgba(245,200,66,0.2)" }}>💡</div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] leading-relaxed italic" style={{ color: "rgba(255,255,255,0.75)" }}>&ldquo;{quote.text}&rdquo;{quote.author && <span className="font-semibold not-italic" style={{ color: "#f5c842" }}> — {quote.author}</span>}</p>
              </div>
            </div>

            {/* ── Main grid ── */}
            <div className="main-grid gap-4 min-h-0">

              {/* My Tasks */}
              <div className="hov-card rounded-2xl flex flex-col overflow-hidden" style={{ background: "#fffef5", border: "1px solid rgba(245,200,66,0.25)", boxShadow: "0 4px 16px rgba(245,200,66,0.1)", borderTop: "3px solid #f5c842" }}>
                <div className="px-5 pt-4 pb-3 shrink-0" style={{ borderBottom: "1px solid rgba(245,200,66,0.12)" }}>
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#f5c842,#f97316)" }}>
                      <svg width="13" height="13" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                    </div>
                    <span className="text-[13px] font-black" style={{ color: "#1a1a2e" }}>My Tasks</span>
                    <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#fef9c3", color: "#a16207" }}>{tasks.length} total</span>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 rounded-full h-1.5" style={{ background: "#f0ebe3" }}>
                      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${taskPct}%`, background: "linear-gradient(90deg,#f5c842,#f97316)" }} />
                    </div>
                    <span className="text-[11px] font-black" style={{ color: "#1a1a2e" }}>{taskPct}%</span>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => e.key === "Enter" && addTask()}
                      placeholder="Add a task..." style={{ ...inp(), flex: 1, fontSize: 11 }} />
                    <button onClick={() => addTask()} className="px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0" style={{ background: "#f5c842", color: "#1a1a2e" }}>Add</button>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setNewPriority("normal")} className="flex-1 py-1 rounded-lg text-[11px] font-semibold transition-all"
                      style={newPriority === "normal" ? { background: "#1a1a2e", color: "#f5c842" } : { background: "#f0ebe3", color: "#9b8f82" }}>Normal</button>
                    <button onClick={() => setNewPriority("urgent")} className="flex-1 py-1 rounded-lg text-[11px] font-semibold transition-all"
                      style={newPriority === "urgent" ? { background: "#ef4444", color: "#fff" } : { background: "#f0ebe3", color: "#9b8f82" }}>🔴 Urgent</button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
                  {[...tasks].sort((a, _b) => a.priority === "urgent" ? -1 : 1).map(task => (
                    <div key={task.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl group transition-all"
                      style={{ background: task.done ? "rgba(245,200,66,0.05)" : task.priority === "urgent" ? "#fff1f0" : "#fff", border: `1px solid ${task.done ? "rgba(245,200,66,0.15)" : task.priority === "urgent" ? "#ffd6d3" : "rgba(245,200,66,0.3)"}` }}>
                      <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} className="w-3.5 h-3.5 cursor-pointer shrink-0" style={{ accentColor: "#f5c842" }} />
                      <span className="flex-1 text-[11px] font-medium" style={{ color: task.done ? "#c4b8aa" : "#1a1a2e", textDecoration: task.done ? "line-through" : "none" }}>{task.text}</span>
                      {!task.done && <span className="text-[9px] px-1.5 py-0.5 rounded-md font-black shrink-0"
                        style={task.priority === "urgent" ? { background: "#fee2e2", color: "#dc2626" } : { background: "#fef9c3", color: "#a16207" }}>{task.priority.toUpperCase()}</span>}
                      <button onClick={() => deleteTask(task.id)} className="text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: "#c4b8aa" }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Team Tasks */}
              <div className="hov-card rounded-2xl flex flex-col overflow-hidden" style={{ background: "#faf8ff", border: "1px solid rgba(139,92,246,0.2)", boxShadow: "0 4px 16px rgba(139,92,246,0.1)", borderTop: "3px solid #8b5cf6" }}>
                <div className="px-5 pt-4 pb-3 shrink-0" style={{ borderBottom: "1px solid rgba(139,92,246,0.1)" }}>
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)" }}>
                      <svg width="13" height="13" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                    </div>
                    <span className="text-[13px] font-black" style={{ color: "#1a1a2e" }}>Team Tasks</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1" style={{ background: "#ede9fe", color: "#7c3aed" }}>{doneTeamTasks}/{teamTasks.length} done</span>
                    <button onClick={() => setShowAddMember(!showAddMember)} className="ml-auto text-[10px] px-2 py-0.5 rounded-lg font-semibold"
                      style={{ border: "1px solid #e5ddd4", color: "#9b8f82" }}>+ Member</button>
                  </div>
                  {showAddMember && (
                    <div className="flex gap-2 mb-2">
                      <input value={newMember} onChange={e => setNewMember(e.target.value)} onKeyDown={e => e.key === "Enter" && addMember()}
                        placeholder="Member name..." style={{ ...inp(), flex: 1, fontSize: 11 }} />
                      <button onClick={addMember} className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-white" style={{ background: "#8b5cf6" }}>Add</button>
                    </div>
                  )}
                  <div className="flex gap-2 mb-2">
                    <input value={newTeamTask} onChange={e => setNewTeamTask(e.target.value)} onKeyDown={e => e.key === "Enter" && addTeamTask()}
                      placeholder="Assign a task..." style={{ ...inp(), flex: 1, fontSize: 11 }} />
                    <button onClick={addTeamTask} className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-white shrink-0" style={{ background: "#8b5cf6" }}>Add</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {members.map(m => (
                      <div key={m} className="flex items-center gap-1">
                        <button onClick={() => setNewAssignee(m)} className="py-0.5 px-2.5 rounded-lg text-[10px] font-bold"
                          style={newAssignee === m ? { background: "#8b5cf6", color: "#fff" } : { background: "#f0ebe3", color: "#9b8f82" }}>{m}</button>
                        <button onClick={() => removeMember(m)} className="text-[10px]" style={{ color: "#c4b8aa" }}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
                  {teamTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl group transition-all"
                      style={{ background: task.done ? "rgba(139,92,246,0.05)" : "#fff", border: `1px solid ${task.done ? "rgba(139,92,246,0.12)" : "rgba(139,92,246,0.25)"}` }}>
                      <input type="checkbox" checked={task.done} onChange={() => toggleTeamTask(task.id)} className="w-3.5 h-3.5 cursor-pointer shrink-0" style={{ accentColor: "#8b5cf6" }} />
                      <span className="flex-1 text-[11px] font-medium" style={{ color: task.done ? "#c4b8aa" : "#1a1a2e", textDecoration: task.done ? "line-through" : "none" }}>{task.text}</span>
                      <span className="text-[9px] px-2 py-0.5 rounded-lg font-black shrink-0" style={{ background: "#ede9fe", color: "#7c3aed" }}>{task.assignee}</span>
                      <button onClick={() => deleteTeamTask(task.id)} className="text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: "#c4b8aa" }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right column */}
              <div className="flex flex-col gap-3 min-h-0">
                {/* Progress ring — bigger, more prominent */}
                <div className="hov-card rounded-2xl p-5 flex flex-col items-center shrink-0"
                  style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 4px 16px rgba(0,0,0,0.07)" }}>
                  <div className="flex items-center gap-2 mb-4 self-start">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}>
                      <svg width="10" height="10" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#64748b" }}>Today&apos;s Progress</p>
                  </div>
                  <div className="relative" style={{ width: 100, height: 100 }}>
                    <svg width="100" height="100" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#f3f4f6" strokeWidth="8" />
                      <circle cx="50" cy="50" r="40" fill="none" strokeWidth="8"
                        stroke={taskPct === 100 ? "#22c55e" : "url(#progressGrad)"}
                        strokeDasharray={2 * Math.PI * 40}
                        strokeDashoffset={2 * Math.PI * 40 - (taskPct / 100) * 2 * Math.PI * 40}
                        strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.5s ease" }} />
                      <defs>
                        <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#f5c842"/>
                          <stop offset="100%" stopColor="#f97316"/>
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                      <p className="text-2xl font-black leading-none" style={{ color: "#1a1a2e" }}>{taskPct}%</p>
                      <p className="text-[9px] mt-0.5 font-medium" style={{ color: "#94a3b8" }}>done</p>
                    </div>
                  </div>
                  <p className="text-[10px] mt-3 font-semibold" style={{ color: "#64748b" }}>{doneTasks} of {tasks.length} tasks complete</p>
                </div>

                {/* Weekly Goals dark card */}
                <div className="rounded-2xl flex flex-col overflow-hidden flex-1"
                  style={{ background: "#0f1419", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                  <div className="px-4 pt-4 pb-3 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Weekly Goals</span>
                      <span className="text-xl font-black" style={{ color: "#f5c842" }}>{goalPct}%</span>
                    </div>
                    <div className="w-full rounded-full h-1 mb-3" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div className="h-1 rounded-full" style={{ width: `${goalPct}%`, background: "#f5c842", transition: "width 0.5s ease" }} />
                    </div>
                    <div className="flex gap-1.5">
                      <input value={newGoal} onChange={e => setNewGoal(e.target.value)} onKeyDown={e => e.key === "Enter" && addGoal()}
                        placeholder="Add a goal..." style={{ ...inp(true), flex: 1, fontSize: 11 }} />
                      <button onClick={addGoal} className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold shrink-0" style={{ background: "#f5c842", color: "#1a1a2e" }}>Add</button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
                    {goals.map(goal => (
                      <div key={goal.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl group"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <input type="checkbox" checked={goal.done} onChange={() => toggleGoal(goal.id)} className="w-3 h-3 cursor-pointer shrink-0" style={{ accentColor: "#f5c842" }} />
                        <span className="flex-1 text-[11px]" style={{ color: goal.done ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.75)", textDecoration: goal.done ? "line-through" : "none" }}>{goal.text}</span>
                        <button onClick={() => deleteGoal(goal.id)} className="opacity-0 group-hover:opacity-100 text-xs shrink-0" style={{ color: "rgba(255,255,255,0.2)" }}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Daily Notes ── */}
            <div className="rounded-2xl flex flex-col overflow-hidden shrink-0" style={{ height: 110, background: "#fff", border: "1px solid #e5ddd4", borderLeft: "3px solid #22c55e", boxShadow: "0 4px 16px rgba(0,0,0,0.07)" }}>
              <div className="flex items-center gap-1 px-4 py-1.5 shrink-0 flex-wrap" style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                <div className="w-2 h-2 rounded-full bg-green-400 shrink-0 mr-1" />
                <span className="text-[11px] font-black mr-2" style={{ color: "#1a1a2e" }}>Daily Notes</span>
                {[
                  { cmd: "bold", label: "B", s: { fontWeight: 900 } },
                  { cmd: "italic", label: "I", s: { fontStyle: "italic" } },
                  { cmd: "underline", label: "U", s: { textDecoration: "underline" } },
                ].map(btn => (
                  <button key={btn.cmd} onMouseDown={e => { e.preventDefault(); document.execCommand(btn.cmd); }}
                    className="w-5 h-5 rounded text-[10px] flex items-center justify-center hover:bg-gray-100"
                    style={{ color: "#1a1a2e", ...btn.s }}>{btn.label}</button>
                ))}
                <div className="w-px h-3 mx-1" style={{ background: "#e8e2d9" }} />
                {[{ cmd: "insertUnorderedList", label: "• List" }, { cmd: "insertOrderedList", label: "1. List" }].map(btn => (
                  <button key={btn.cmd} onMouseDown={e => { e.preventDefault(); document.execCommand(btn.cmd); }}
                    className="h-5 px-1.5 rounded text-[10px] hover:bg-gray-100" style={{ color: "#1a1a2e" }}>{btn.label}</button>
                ))}
              </div>
              <div contentEditable suppressContentEditableWarning className="flex-1 overflow-y-auto px-4 py-2 text-[11px] leading-relaxed focus:outline-none"
                style={{ color: "#1a1a2e" }} data-placeholder="Reminders, follow-ups, observations for today..."
                dangerouslySetInnerHTML={{ __html: noteContent }}
                onBlur={e => saveNote(e.currentTarget.innerHTML)} />
            </div>

          </div>
        )}

        {/* ══════════════ MY TASKS PAGE ══════════════ */}
        {activePage === "My Tasks" && (
          <div className="flex-1 overflow-y-auto px-4 md:px-7 pt-4 pb-20 md:pb-6 flex flex-col md:flex-row gap-5" style={{ background: "#eef0f5" }}>
            {/* Left panel */}
            <div className="w-full md:w-56 shrink-0 flex flex-col gap-3">
              <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-4" style={{ color: "#a09080" }}>New Task</p>
                <div className="relative mb-3">
                  <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => e.key === "Enter" && addTask()}
                    placeholder="What needs to be done?" style={{ ...inp(), paddingRight: 48, fontSize: 12 }} />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] px-1 py-0.5 rounded font-mono pointer-events-none"
                    style={{ background: "#f0ebe3", color: "#a09080" }}>↵</span>
                </div>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setNewPriority("normal")} className="flex-1 py-2 rounded-xl text-[11px] font-bold transition-all"
                    style={newPriority === "normal" ? { background: "#1a1a2e", color: "#f5c842" } : { background: "#f0ebe3", color: "#9b8f82" }}>Normal</button>
                  <button onClick={() => setNewPriority("urgent")} className="flex-1 py-2 rounded-xl text-[11px] font-bold transition-all"
                    style={newPriority === "urgent" ? { background: "#ef4444", color: "#fff" } : { background: "#f0ebe3", color: "#9b8f82" }}>🔴 Urgent</button>
                </div>
                <button onClick={() => addTask()} className="w-full py-2.5 rounded-xl text-[12px] font-black"
                  style={{ background: "#f5c842", color: "#1a1a2e" }}>Add Task</button>
              </div>
              <div className="rounded-2xl p-5 shrink-0" style={{ background: "#0f1419", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>Overview</p>
                {[
                  { label: "Total", value: tasks.length, color: "#f5c842" },
                  { label: "Completed", value: doneTasks, color: "#22c55e" },
                  { label: "Pending", value: tasks.length - doneTasks, color: "#e5ddd4" },
                  { label: "Urgent", value: urgentTasks, color: "#ef4444" },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between mb-3">
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>{s.label}</span>
                    <span className="text-base font-black" style={{ color: s.color }}>{s.value}</span>
                  </div>
                ))}
                <div className="w-full rounded-full h-1.5 mt-3" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${taskPct}%`, background: "#f5c842", transition: "width 0.5s ease" }} />
                </div>
                <p className="text-[10px] mt-1.5 text-right" style={{ color: "rgba(255,255,255,0.3)" }}>{taskPct}% done</p>
              </div>
            </div>

            {/* Task columns */}
            <div className="flex-1 flex gap-4 min-h-0 min-w-0">
              <div className="flex-1 flex flex-col overflow-hidden rounded-2xl" style={{ background: "#fffef5", border: "1px solid rgba(245,200,66,0.25)", boxShadow: "0 4px 16px rgba(245,200,66,0.1)", borderTop: "3px solid #f5c842" }}>
                <div className="px-5 pt-4 pb-3 shrink-0 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(245,200,66,0.15)" }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: "#f5c842" }} />
                  <span className="text-[13px] font-black" style={{ color: "#1a1a2e" }}>Pending</span>
                  <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#fef9c3", color: "#a16207" }}>{tasks.filter(t=>!t.done).length}</span>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {tasks.filter(t=>!t.done).length === 0 && (
                    <div className="flex flex-col items-center py-12 gap-2 opacity-50"><div className="text-4xl">🎉</div><p className="text-sm font-semibold" style={{ color: "#a09080" }}>All done!</p></div>
                  )}
                  {[...tasks].filter(t=>!t.done).sort((a,_b) => a.priority==="urgent"?-1:1).map(task => (
                    <div key={task.id} className="flex items-start gap-3 px-4 py-3 rounded-xl group transition-all"
                      style={{ background: task.priority==="urgent"?"#fff1f0":"#fffdf5", border:`1px solid ${task.priority==="urgent"?"#ffd6d3":"#fef08a"}` }}>
                      <input type="checkbox" checked={false} onChange={() => toggleTask(task.id)} className="w-4 h-4 cursor-pointer shrink-0 mt-0.5" style={{ accentColor: "#f5c842" }} />
                      <span className="flex-1 text-[12px] font-medium" style={{ color: "#1a1a2e" }}>{task.text}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-black shrink-0"
                        style={task.priority==="urgent"?{background:"#fee2e2",color:"#dc2626"}:{background:"#fef9c3",color:"#a16207"}}>{task.priority.toUpperCase()}</span>
                      <button onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 text-xs shrink-0" style={{ color: "#c4b8aa" }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden rounded-2xl" style={{ background: "#f0fdf4", border: "1px solid rgba(34,197,94,0.2)", boxShadow: "0 4px 16px rgba(34,197,94,0.08)", borderTop: "3px solid #22c55e" }}>
                <div className="px-5 pt-4 pb-3 shrink-0 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(34,197,94,0.15)" }}>
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-[13px] font-black" style={{ color: "#1a1a2e" }}>Completed</span>
                  <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#dcfce7", color: "#15803d" }}>{doneTasks}</span>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {doneTasks===0 && <div className="flex flex-col items-center py-12 gap-2 opacity-50"><div className="text-4xl">📋</div><p className="text-sm font-semibold" style={{ color: "#a09080" }}>Nothing yet</p></div>}
                  {tasks.filter(t=>t.done).map(task => (
                    <div key={task.id} className="flex items-center gap-3 px-4 py-3 rounded-xl group" style={{ background: "#f9f9f7", border: "1px solid #f0ebe3" }}>
                      <input type="checkbox" checked onChange={() => toggleTask(task.id)} className="w-4 h-4 cursor-pointer shrink-0" style={{ accentColor: "#22c55e" }} />
                      <span className="flex-1 text-[12px] line-through" style={{ color: "#c4b8aa" }}>{task.text}</span>
                      <button onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 text-xs shrink-0" style={{ color: "#c4b8aa" }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ TEAM TASKS PAGE ══════════════ */}
        {activePage === "Team Tasks" && (
          <div className="flex-1 overflow-y-auto px-4 md:px-7 pt-4 pb-20 md:pb-6 flex flex-col md:flex-row gap-5" style={{ background: "#eef0f5" }}>
            <div className="w-full md:w-56 shrink-0 flex flex-col gap-3">
              <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-4" style={{ color: "#a09080" }}>Assign Task</p>
                <input value={newTeamTask} onChange={e => setNewTeamTask(e.target.value)} onKeyDown={e => e.key === "Enter" && addTeamTask()}
                  placeholder="Task description..." style={{ ...inp(), marginBottom: 10, fontSize: 12 }} />
                <p className="text-[10px] font-semibold mb-2" style={{ color: "#a09080" }}>Assign to:</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {members.map(m => (
                    <button key={m} onClick={() => setNewAssignee(m)} className="py-1 px-3 rounded-xl text-[11px] font-bold"
                      style={newAssignee===m?{background:"#8b5cf6",color:"#fff"}:{background:"#f0ebe3",color:"#9b8f82"}}>{m}</button>
                  ))}
                </div>
                <button onClick={addTeamTask} className="w-full py-2.5 rounded-xl text-[12px] font-black text-white mb-3" style={{ background: "#8b5cf6" }}>Assign Task</button>
                <div style={{ borderTop: "1px solid #f0ebe3", paddingTop: 12 }}>
                  {showAddMember ? (
                    <div className="flex gap-2">
                      <input value={newMember} onChange={e => setNewMember(e.target.value)} onKeyDown={e => e.key === "Enter" && addMember()}
                        placeholder="Member name..." style={{ ...inp(), flex: 1, fontSize: 12 }} />
                      <button onClick={addMember} className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-white" style={{ background: "#8b5cf6" }}>Add</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddMember(true)} className="w-full py-2 rounded-xl text-[11px] font-semibold"
                      style={{ border: "1px dashed #d6cfc6", color: "#a09080" }}>+ Add Team Member</button>
                  )}
                </div>
              </div>
              <div className="rounded-2xl p-5 shrink-0" style={{ background: "#0f1419", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.3)" }}>Team Members</p>
                {members.map(m => (
                  <div key={m} className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black" style={{ background: "#8b5cf6", color: "#fff" }}>{m[0]}</div>
                      <span className="text-[12px] font-medium text-white">{m}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg" style={{ background: "rgba(139,92,246,0.2)", color: "#c4b5fd" }}>
                        {teamTasks.filter(t=>t.assignee===m&&!t.done).length} left
                      </span>
                      <button onClick={() => removeMember(m)} className="text-xs" style={{ color: "rgba(255,255,255,0.15)" }}>✕</button>
                    </div>
                  </div>
                ))}
                {members.length===0 && <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>No members yet.</p>}
              </div>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden rounded-2xl" style={{ background: "#faf8ff", border: "1px solid rgba(139,92,246,0.2)", boxShadow: "0 4px 16px rgba(139,92,246,0.1)", borderTop: "3px solid #8b5cf6" }}>
              <div className="px-5 pt-4 pb-3 shrink-0 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(139,92,246,0.12)" }}>
                <div className="w-2 h-2 rounded-full" style={{ background: "#8b5cf6" }} />
                <span className="text-[13px] font-black" style={{ color: "#1a1a2e" }}>All Team Tasks</span>
                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#ede9fe", color: "#7c3aed" }}>{doneTeamTasks}/{teamTasks.length} done</span>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                {teamTasks.length===0 && <div className="flex flex-col items-center py-12 gap-2 opacity-50"><div className="text-4xl">👥</div><p className="text-sm font-semibold" style={{ color: "#a09080" }}>No tasks yet</p></div>}
                {teamTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 px-4 py-3.5 rounded-xl group transition-all"
                    style={{ background: task.done?"#fafaf8":"#f5f0ff", border:`1px solid ${task.done?"#f0ebe3":"#ddd6fe"}` }}>
                    <input type="checkbox" checked={task.done} onChange={() => toggleTeamTask(task.id)} className="w-4 h-4 cursor-pointer shrink-0" style={{ accentColor: "#8b5cf6" }} />
                    <span className="flex-1 text-[12px] font-medium" style={{ color: task.done?"#c4b8aa":"#1a1a2e", textDecoration: task.done?"line-through":"none" }}>{task.text}</span>
                    <span className="text-[10px] px-2.5 py-1 rounded-lg font-black shrink-0" style={{ background: "#ede9fe", color: "#7c3aed" }}>{task.assignee}</span>
                    <button onClick={() => deleteTeamTask(task.id)} className="opacity-0 group-hover:opacity-100 text-xs shrink-0" style={{ color: "#c4b8aa" }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ UPWORK JOBS PAGE ══════════════ */}
        {activePage === "Upwork Jobs" && (
          <div className="flex-1 overflow-y-auto px-4 md:px-7 pt-4 pb-20 md:pb-6 flex flex-col md:flex-row gap-5" style={{ background: "#eef0f5" }}>
            <div className="w-full md:w-56 shrink-0 flex flex-col gap-3">
              <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-4" style={{ color: "#a09080" }}>Track Job</p>
                <input value={newJobLink} onChange={e => setNewJobLink(e.target.value)} placeholder="Upwork job link..." style={{ ...inp(), marginBottom: 8, fontSize: 12 }} />
                <input value={newJobNote} onChange={e => setNewJobNote(e.target.value)} onKeyDown={e => e.key === "Enter" && addJob()}
                  placeholder="Why it's a good fit..." style={{ ...inp(), marginBottom: 10, fontSize: 12 }} />
                <button onClick={addJob} className="w-full py-2.5 rounded-xl text-[12px] font-black text-white" style={{ background: "#f97316" }}>+ Track Job</button>
              </div>
              <div className="rounded-2xl p-5 shrink-0" style={{ background: "#0f1419", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.3)" }}>Pipeline</p>
                <p className="text-4xl font-black mb-1" style={{ color: "#f97316" }}>{jobs.length}</p>
                <p className="text-[11px] font-medium mb-4" style={{ color: "rgba(255,255,255,0.3)" }}>jobs tracked</p>
                {(["New","Shortlisted","Proposal Sent","Rejected"] as Job["status"][]).map(st => (
                  <div key={st} className="flex items-center justify-between mb-2">
                    <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{st}</span>
                    <span className="text-[12px] font-black" style={{ color: "#f97316" }}>{jobs.filter(j=>j.status===st).length}</span>
                  </div>
                ))}
                <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.25)" }}>Target: 5–10 quality jobs shortlisted per day.</p>
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden rounded-2xl" style={{ background: "#fff8f5", border: "1px solid rgba(249,115,22,0.2)", boxShadow: "0 4px 16px rgba(249,115,22,0.1)", borderTop: "3px solid #f97316" }}>
              <div className="px-5 pt-4 pb-3 shrink-0 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(249,115,22,0.12)" }}>
                <div className="w-2 h-2 rounded-full" style={{ background: "#f97316" }} />
                <span className="text-[13px] font-black" style={{ color: "#1a1a2e" }}>Tracked Jobs</span>
                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#fff7ed", color: "#c2410c" }}>{jobs.length} total</span>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {jobs.length===0 && <div className="flex flex-col items-center py-12 gap-2 opacity-50"><div className="text-4xl">💼</div><p className="text-sm font-semibold" style={{ color: "#a09080" }}>No jobs tracked yet</p><p className="text-xs" style={{ color: "#c4b8aa" }}>Paste a job link to start</p></div>}
                {jobs.map((job, i) => {
                  const ss: Record<Job["status"],{bg:string;text:string;border:string}> = {
                    "New":          {bg:"#fff7ed",text:"#ea580c",border:"#fed7aa"},
                    "Shortlisted":  {bg:"#fffbeb",text:"#d97706",border:"#fde68a"},
                    "Proposal Sent":{bg:"#f0fdf4",text:"#16a34a",border:"#bbf7d0"},
                    "Rejected":     {bg:"#fef2f2",text:"#dc2626",border:"#fecaca"},
                  };
                  const s = ss[job.status];
                  return (
                    <div key={job.id} className="px-4 py-4 rounded-xl group transition-all" style={{ background: s.bg, border:`1px solid ${s.border}` }}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "#f97316", color: "#fff" }}>#{i+1}</span>
                            <a href={job.link.startsWith("http")?job.link:`https://${job.link}`} target="_blank" rel="noopener noreferrer"
                              className="text-[11px] font-bold truncate hover:underline" style={{ color: s.text }}>{job.link}</a>
                          </div>
                          {job.note && <p className="text-[11px]" style={{ color: "#6b5a4e" }}>{job.note}</p>}
                        </div>
                        <button onClick={() => deleteJob(job.id)} className="opacity-0 group-hover:opacity-100 text-xs shrink-0" style={{ color: "#c4b8aa" }}>✕</button>
                      </div>
                      <div className="flex gap-1.5">
                        {(["Shortlisted","Proposal Sent","Rejected"] as Job["status"][]).map(st => (
                          <button key={st} onClick={() => updateJobStatus(job.id, job.status===st?"New":st)}
                            className="text-[10px] px-2.5 py-1 rounded-lg font-bold transition-all"
                            style={job.status===st?{background:s.text,color:"#fff"}:{background:"rgba(0,0,0,0.05)",color:"#9b8f82"}}>
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ WEEKLY GOALS PAGE ══════════════ */}
        {activePage === "Weekly Goals" && (
          <div className="flex-1 overflow-y-auto px-4 md:px-7 pt-4 pb-20 md:pb-6 flex flex-col md:flex-row gap-5" style={{ background: "#eef0f5" }}>
            <div className="w-full md:w-56 shrink-0 flex flex-col gap-3">
              <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-4" style={{ color: "#a09080" }}>New Goal</p>
                <input value={newGoal} onChange={e => setNewGoal(e.target.value)} onKeyDown={e => e.key === "Enter" && addGoal()}
                  placeholder="What's the goal this week?" style={{ ...inp(), marginBottom: 10, fontSize: 12 }} />
                <button onClick={addGoal} className="w-full py-2.5 rounded-xl text-[12px] font-black" style={{ background: "#f5c842", color: "#1a1a2e" }}>Add Goal</button>
              </div>
              <div className="rounded-2xl p-5 flex flex-col items-center shrink-0" style={{ background: "#0f1419", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-4 self-start" style={{ color: "rgba(255,255,255,0.3)" }}>Weekly Progress</p>
                <div className="relative" style={{ width: 110, height: 110 }}>
                  <svg width="110" height="110" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="55" cy="55" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                    <circle cx="55" cy="55" r="44" fill="none" stroke="#f5c842" strokeWidth="10"
                      strokeDasharray={2*Math.PI*44} strokeDashoffset={2*Math.PI*44-(goalPct/100)*2*Math.PI*44}
                      strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.5s ease" }} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-2xl font-black text-white">{goalPct}%</p>
                  </div>
                </div>
                <p className="text-[11px] mt-3 font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>{doneGoals} of {goals.length} goals done</p>
              </div>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden rounded-2xl" style={{ background: "#fffef0", border: "1px solid rgba(245,200,66,0.3)", boxShadow: "0 4px 16px rgba(245,200,66,0.12)", borderTop: "3px solid #f5c842" }}>
              <div className="px-5 pt-4 pb-3 shrink-0 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(245,200,66,0.2)" }}>
                <div className="w-2 h-2 rounded-full" style={{ background: "#f5c842" }} />
                <span className="text-[13px] font-black" style={{ color: "#1a1a2e" }}>This Week&apos;s Goals</span>
                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#fef9c3", color: "#a16207" }}>{doneGoals}/{goals.length} done</span>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
                {goals.length===0 && <div className="flex flex-col items-center py-12 gap-2 opacity-50"><div className="text-4xl">🎯</div><p className="text-sm font-semibold" style={{ color: "#a09080" }}>No goals this week</p></div>}
                {goals.map(goal => (
                  <div key={goal.id} className="flex items-center gap-3 px-4 py-4 rounded-xl group transition-all"
                    style={{ background: goal.done?"#f0fdf4":"#fffdf5", border:`1px solid ${goal.done?"#bbf7d0":"#fef08a"}` }}>
                    <input type="checkbox" checked={goal.done} onChange={() => toggleGoal(goal.id)} className="w-4 h-4 cursor-pointer shrink-0" style={{ accentColor: "#f5c842" }} />
                    <span className="flex-1 text-[12px] font-medium" style={{ color: goal.done?"#15803d":"#1a1a2e", textDecoration: goal.done?"line-through":"none" }}>{goal.text}</span>
                    {goal.done && <span className="text-[10px] font-black shrink-0 px-2 py-0.5 rounded-lg" style={{ background: "#dcfce7", color: "#15803d" }}>Done ✓</span>}
                    <button onClick={() => deleteGoal(goal.id)} className="opacity-0 group-hover:opacity-100 text-xs shrink-0" style={{ color: "#c4b8aa" }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ NOTES PAGE ══════════════ */}
        {activePage === "Notes" && (
          <div className="flex-1 overflow-y-auto px-4 md:px-7 pt-4 pb-20 md:pb-6 flex flex-col md:flex-row gap-5" style={{ background: "#eef0f5" }}>
            <div className="flex-1 flex flex-col overflow-hidden rounded-2xl" style={{ background: "#f0fdf8", border: "1px solid rgba(34,197,94,0.2)", boxShadow: "0 4px 16px rgba(34,197,94,0.08)", borderTop: "3px solid #22c55e" }}>
              <div className="px-4 py-2.5 shrink-0 flex items-center gap-1 flex-wrap" style={{ borderBottom: "1px solid rgba(34,197,94,0.15)", background: "rgba(240,253,248,0.8)" }}>
                <span className="text-[11px] font-black mr-3" style={{ color: "#1a1a2e" }}>📝 Daily Notes</span>
                {[
                  { cmd: "bold",          label: "B",   s: { fontWeight: 900 } },
                  { cmd: "italic",        label: "I",   s: { fontStyle: "italic" } },
                  { cmd: "underline",     label: "U",   s: { textDecoration: "underline" } },
                  { cmd: "strikeThrough", label: "S",   s: { textDecoration: "line-through" } },
                ].map(btn => (
                  <button key={btn.cmd} onMouseDown={e => { e.preventDefault(); document.execCommand(btn.cmd); }}
                    className="w-7 h-7 rounded-lg text-xs flex items-center justify-center hover:bg-gray-100 transition-all"
                    style={{ color: "#1a1a2e", ...btn.s }}>{btn.label}</button>
                ))}
                <div className="w-px h-4 mx-1" style={{ background: "#e8e2d9" }} />
                {[{ cmd:"insertUnorderedList",label:"• List"},{cmd:"insertOrderedList",label:"1. List"}].map(btn => (
                  <button key={btn.cmd} onMouseDown={e => { e.preventDefault(); document.execCommand(btn.cmd); }}
                    className="h-7 px-2.5 rounded-lg text-xs hover:bg-gray-100 transition-all" style={{ color: "#1a1a2e" }}>{btn.label}</button>
                ))}
                <div className="w-px h-4 mx-1" style={{ background: "#e8e2d9" }} />
                {[{cmd:"formatBlock",value:"h2",label:"H1"},{cmd:"formatBlock",value:"h3",label:"H2"},{cmd:"formatBlock",value:"p",label:"¶"}].map(btn => (
                  <button key={btn.label} onMouseDown={e => { e.preventDefault(); document.execCommand(btn.cmd, false, btn.value); }}
                    className="h-7 px-2.5 rounded-lg text-xs font-bold hover:bg-gray-100 transition-all" style={{ color: "#1a1a2e" }}>{btn.label}</button>
                ))}
                <div className="w-px h-4 mx-1" style={{ background: "#e8e2d9" }} />
                <button onMouseDown={e => { e.preventDefault(); document.execCommand("removeFormat"); document.execCommand("formatBlock", false, "p"); }}
                  className="h-7 px-2.5 rounded-lg text-xs hover:bg-gray-100 transition-all" style={{ color: "#a09080" }}>Clear</button>
              </div>
              <div contentEditable suppressContentEditableWarning data-placeholder="Write your reminders, follow-ups, meeting notes..."
                className="flex-1 overflow-y-auto px-6 py-5 text-sm leading-relaxed focus:outline-none" style={{ color: "#1a1a2e" }}
                dangerouslySetInnerHTML={{ __html: noteContent }}
                onBlur={e => saveNote(e.currentTarget.innerHTML)} />
            </div>
            <div className="w-full md:w-52 shrink-0 flex flex-col gap-4">
              <div className="rounded-2xl p-5" style={{ background: "#0f1419", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.3)" }}>Shortcuts</p>
                {[["Ctrl+B","Bold"],["Ctrl+I","Italic"],["Ctrl+U","Underline"],["- Space","Bullet list"],["1. Space","Numbered"]].map(([k,d]) => (
                  <div key={k} className="flex items-center justify-between mb-2.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}>{k}</span>
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{d}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl p-5 shrink-0" style={{ background: "#0f1419", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.3)" }}>Tips</p>
                {["Log follow-ups you can't forget","Write blockers before standup","Note questions for Hasham","Track expenses to log later"].map(tip => (
                  <div key={tip} className="flex gap-2 mb-3">
                    <span style={{ color: "#f5c842", flexShrink: 0 }}>→</span>
                    <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.3)" }}>{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
