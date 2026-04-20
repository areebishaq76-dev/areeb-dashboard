"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"auth" | "username">("auth");
  const [userId, setUserId] = useState("");

  async function handleAuth() {
    if (!email.trim() || !password.trim()) { setError("Please enter email and password."); return; }
    setLoading(true); setError("");
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message); setLoading(false); return; }
        if (data.user) {
          // Check if profile exists, if not go to username step
          const { data: profile } = await supabase.from("profiles").select("username").eq("id", data.user.id).single();
          if (!profile) { setUserId(data.user.id); setStep("username"); }
          else { window.location.replace("/"); }
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) { setError(error.message); setLoading(false); return; }
        if (data.user) { setUserId(data.user.id); setStep("username"); }
      }
    } catch (e) { setError("Something went wrong: " + String(e)); }
    setLoading(false);
  }

  async function handleSetUsername() {
    if (!username.trim()) { setError("Please enter a username."); return; }
    setLoading(true); setError("");
    try {
      const { error } = await supabase.from("profiles").insert({ id: userId, username: username.trim() });
      if (error) { setError(error.message); setLoading(false); return; }
      window.location.href = "/";
    } catch { setError("Something went wrong. Try again."); }
    setLoading(false);
  }

  const inp = {
    width: "100%", padding: "11px 14px", borderRadius: 12, fontSize: 14,
    border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)",
    color: "#fff", outline: "none",
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f1419", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'); * { box-sizing: border-box; } input::placeholder { color: rgba(255,255,255,0.25); }`}</style>

      <div className="w-full max-w-sm px-4">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow: "0 4px 20px rgba(99,102,241,0.4)" }}>
            <span style={{ color: "#fff" }}>CS</span>
          </div>
          <div>
            <p className="text-[15px] font-bold leading-none text-white">CodesSavvy</p>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>Team Dashboard</p>
          </div>
        </div>

        <div className="rounded-2xl p-7" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>

          {step === "auth" ? (
            <>
              <h1 className="text-xl font-black text-white mb-1">{mode === "login" ? "Welcome back" : "Create account"}</h1>
              <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.35)" }}>
                {mode === "login" ? "Sign in to your dashboard" : "Set up your team dashboard account"}
              </p>

              <div className="space-y-3">
                <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAuth()}
                  placeholder="Email address" type="email" style={inp} />
                <input value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAuth()}
                  placeholder="Password" type="password" style={inp} />
              </div>

              {error && <p className="text-[12px] mt-3 px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>{error}</p>}

              <button onClick={handleAuth} disabled={loading}
                className="w-full mt-4 py-3 rounded-xl text-[14px] font-black text-white transition-all"
                style={{ background: loading ? "rgba(99,102,241,0.5)" : "linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}>
                {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
              </button>

              <p className="text-center text-[12px] mt-4" style={{ color: "rgba(255,255,255,0.3)" }}>
                {mode === "login" ? "Don't have an account? " : "Already have an account? "}
                <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
                  className="font-bold" style={{ color: "#a5b4fc" }}>
                  {mode === "login" ? "Sign up" : "Sign in"}
                </button>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-black text-white mb-1">One last step</h1>
              <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.35)" }}>Set your display name for the dashboard</p>
              <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSetUsername()}
                placeholder="Your name (e.g. Areeb)" style={inp} />
              {error && <p className="text-[12px] mt-3 px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>{error}</p>}
              <button onClick={handleSetUsername} disabled={loading}
                className="w-full mt-4 py-3 rounded-xl text-[14px] font-black text-white"
                style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}>
                {loading ? "Saving..." : "Get Started →"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
