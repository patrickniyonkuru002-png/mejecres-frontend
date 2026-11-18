import { useEffect, useMemo, useState } from "react";
import {
  Bell, CalendarDays, Clock, History, Home, Plus, Pencil,
  Trash2, Volume2, VolumeX, Zap, LogOut, X, Check,
  ChevronRight, Menu, User, Lock, Eye, EyeOff,
} from "lucide-react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const DEVICE_ID = "mejecres-bell-01";

const DEFAULT_BELLS = [
  { id: 1, time: "08:00", name: "Morning Assembly", active: true },
  { id: 2, time: "09:00", name: "Period 1 Change", active: true },
  { id: 3, time: "10:00", name: "Period 2 Change", active: true },
  { id: 4, time: "10:45", name: "Recess Break", active: true },
  { id: 5, time: "11:10", name: "Period 3 Start", active: true },
  { id: 6, time: "12:20", name: "Lunch Time", active: true },
  { id: 7, time: "13:20", name: "Afternoon Session", active: true },
  { id: 8, time: "14:30", name: "Period 4 End", active: true },
  { id: 9, time: "15:30", name: "Dismissal Bell", active: true },
];

const readSaved = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const to12Hour = (time24) => {
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return { hour12: String(h).padStart(2, "0"), minute: mStr, period };
};

const to24Hour = (hour12, minute, period) => {
  let h = parseInt(hour12, 10);
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
};

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [page, setPage] = useState("Dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [bells, setBells] = useState(() => readSaved("mejecres_bells", DEFAULT_BELLS));
  const [history, setHistory] = useState(() => readSaved("mejecres_history", []));
  const [muted, setMuted] = useState(false);
  const [ringing, setRinging] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    hour12: "08", minute: "00", period: "AM", name: "", active: true,
  });
  const [notice, setNotice] = useState("");

  // ⏰ RTC time from the physical hardware
  const [rtcTime, setRtcTime] = useState(null);

  // ────────────────────────────────────────────────
  // ⏱ Local clock (fallback if RTC offline)
  // ────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ────────────────────────────────────────────────
  // 🔁 Poll RTC time from backend every 2s
  // ────────────────────────────────────────────────
  useEffect(() => {
    if (!loggedIn) return;

    let active = true;

    async function fetchRtc() {
      try {
        const res = await fetch(
          `${API_URL}/api/hardware/time?device_id=${DEVICE_ID}`
        );
        if (!res.ok) return;               // no RTC yet — keep previous
        const data = await res.json();
        if (!active) return;

        // Reconstruct live time by adding elapsed seconds
        const received = new Date(data.received_at + "Z");
        const rtcBase = new Date(data.rtc_time);
        const elapsed = (Date.now() - received.getTime()) / 1000;
        setRtcTime(new Date(rtcBase.getTime() + elapsed * 1000));
      } catch {
        // silent — keep last known time
      }
    }

    fetchRtc();
    const id = setInterval(fetchRtc, 2000);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [loggedIn]);

  // Local ticking so RTC time moves forward smoothly between fetches
  useEffect(() => {
    const tick = setInterval(() => {
      setRtcTime((prev) => (prev ? new Date(prev.getTime() + 1000) : prev));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    localStorage.setItem("mejecres_bells", JSON.stringify(bells));
  }, [bells]);

  useEffect(() => {
    localStorage.setItem("mejecres_history", JSON.stringify(history));
  }, [history]);

  const sortedBells = useMemo(
    () => [...bells].sort((a, b) => a.time.localeCompare(b.time)),
    [bells]
  );

  const activeBells = sortedBells.filter((bell) => bell.active);

  // 🔁 useRTC for countdown so it aligns with physical bell
  const clockNow = rtcTime || now;

  const nextBell = useMemo(() => {
    const currentMinutes = clockNow.getHours() * 60 + clockNow.getMinutes();
    const upcoming = activeBells.find((bell) => {
      const [h, m] = bell.time.split(":").map(Number);
      return h * 60 + m > currentMinutes;
    });
    return upcoming || activeBells[0] || null;
  }, [activeBells, clockNow]);

  const countdown = useMemo(() => {
    if (!nextBell) return "No active bells";
    const [h, m] = nextBell.time.split(":").map(Number);
    const target = new Date(clockNow);
    target.setHours(h, m, 0, 0);
    if (target <= clockNow) target.setDate(target.getDate() + 1);
    const seconds = Math.floor((target - clockNow) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }, [nextBell, clockNow]);

  function signIn(event) {
    event.preventDefault();
    if (loginName.trim().toLowerCase() === "admin" && loginPassword === "1234") {
      setLoggedIn(true);
      setLoginError("");
    } else {
      setLoginError("Incorrect username or password.");
    }
  }

  function openAddModal() {
    setEditingId(null);
    setForm({ hour12: "08", minute: "00", period: "AM", name: "", active: true });
    setModalOpen(true);
  }

  function openEditModal(bell) {
    const parsed = to12Hour(bell.time);
    setEditingId(bell.id);
    setForm({
      hour12: parsed.hour12,
      minute: parsed.minute,
      period: parsed.period,
      name: bell.name,
      active: bell.active,
    });
    setModalOpen(true);
  }

  function saveBell(event) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const time24 = to24Hour(form.hour12, form.minute, form.period);

    if (editingId !== null) {
      setBells((old) =>
        old.map((bell) =>
          bell.id === editingId
            ? { ...bell, time: time24, name, active: form.active }
            : bell
        )
      );
      setNotice("Bell updated successfully.");
    } else {
      setBells((old) => [
        ...old,
        { id: Date.now(), time: time24, name, active: form.active },
      ]);
      setNotice("New bell added.");
    }
    setModalOpen(false);
  }

  function deleteBell(id) {
    const bell = bells.find((item) => item.id === id);
    if (!bell) return;
    if (!window.confirm(`Delete "${bell.name}" from the schedule?`)) return;
    setBells((old) => old.filter((item) => item.id !== id));
    setNotice("Bell deleted.");
  }

  function toggleBell(id) {
    setBells((old) =>
      old.map((bell) => (bell.id === id ? { ...bell, active: !bell.active } : bell))
    );
  }

  async function ringNow() {
    if (muted) {
      setNotice("Unmute the bell before ringing.");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/hardware/ring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: DEVICE_ID }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const record = {
        id: Date.now(),
        name: "Manual Ring",
        time: new Date().toLocaleString(),
      };
      setHistory((old) => [record, ...old].slice(0, 100));
      setRinging(true);
      setNotice("Ring command sent — bell will ring in ~2 seconds.");
      window.setTimeout(() => setRinging(false), 2500);
    } catch (err) {
      console.error(err);
      setNotice("❌ Failed to reach bell. Check backend connection.");
    }
  }

  function clearHistory() {
    if (!history.length) return;
    if (!window.confirm("Clear all ring history?")) return;
    setHistory([]);
    setNotice("Ring history cleared.");
  }

  function navigate(destination) {
    setPage(destination);
    setMenuOpen(false);
    setNotice("");
  }

  function logout() {
    setLoggedIn(false);
    setLoginPassword("");
    setPage("Dashboard");
    setRtcTime(null);
  }

  const navItems = [
    { label: "Dashboard", icon: Home },
    { label: "Bell Schedule", icon: CalendarDays },
    { label: "Ring History", icon: History },
  ];

  if (!loggedIn) {
    return (
      <div className="login-page">
        <div className="login-visual">
          <div className="login-visual-top">
            <div className="login-visual-logo"><Bell size={24} /></div>
            <div className="login-visual-brand-text">
              <strong>MEJECRES</strong>
              <span>School Bell System</span>
            </div>
          </div>

          <div className="login-visual-body">
            <h2>Every bell,<br /><span>perfectly on time.</span></h2>
            <p>
              A modern, reliable school bell management platform. Schedule bells,
              control them in real time, and keep your school day running smoothly.
            </p>
          </div>

          <div className="login-orb" aria-hidden="true">
            <Bell size={140} strokeWidth={0.8} />
          </div>
        </div>

        <div className="login-form-panel">
          <form className="login-card" onSubmit={signIn}>
            <div className="login-mobile-brand">
              <div className="login-mobile-mark"><Bell size={22} /></div>
              <div>
                <strong>MEJECRES</strong>
                <span>School Bell System</span>
              </div>
            </div>

            <div className="login-heading">
              <h1>Welcome to School bell</h1>
            </div>

            <div className="login-field">
              <label htmlFor="username">Username</label>
              <div className="login-input-wrap">
                <User size={17} />
                <input
                  id="username"
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="password">Password</label>
              <div className="login-input-wrap">
                <Lock size={17} />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {loginError && (
              <p className="error-message">
                <X size={15} /> {loginError}
              </p>
            )}

            <button className="login-submit" type="submit">
              Enter <ChevronRight size={18} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Bell size={23} /></div>
          <div className="brand-text">
            <strong>MEJECRES</strong>
            <span>School Bell System</span>
          </div>
          <button className="mobile-close" onClick={() => setMenuOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav>
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-link ${page === label ? "nav-active" : ""}`}
              onClick={() => navigate(label)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {page === label && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="logout-button" onClick={logout}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      {menuOpen && (
        <button
          className="mobile-backdrop"
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
        />
      )}

      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={21} />
          </button>
          <div>
            <h1>{page}</h1>
            <p className="topbar-subtitle">
              {page === "Dashboard" && "Your school bell at a glance."}
              {page === "Bell Schedule" && "Create and manage your bell timetable."}
              {page === "Ring History" && "Review recent manual ring activity."}
            </p>
          </div>
          <div className="topbar-clock">
            <div className="clock-icon"><Clock size={20} /></div>
            <div>
              <strong>
                {rtcTime
                  ? rtcTime.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "--:--:--"}
              </strong>
              <span>
                {rtcTime
                  ? rtcTime.toLocaleDateString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Waiting for RTC…"}
              </span>
            </div>
          </div>
        </header>

        {notice && (
          <div className="notice" role="status">
            <Check size={17} /> {notice}
            <button onClick={() => setNotice("")} aria-label="Dismiss message">
              <X size={16} />
            </button>
          </div>
        )}

        {page === "Dashboard" && (
          <>
            <section className="welcome-banner">
              <div>
                <span className="banner-tag">Daily overview</span>
                <h2>Good day, Administrator</h2>
                <p>Keep your school day running on time.</p>
              </div>
              <div className="banner-art"><Bell size={58} /></div>
            </section>

            <section className="stats">
              <Stat icon={<CalendarDays />} label="Scheduled bells" value={bells.length} />
              <Stat icon={<Check />} label="Active bells" value={activeBells.length} />
              <Stat
                icon={<Clock />}
                label="Next bell"
                value={nextBell?.time || "--:--"}
                note={nextBell?.name || "No active bells"}
              />
              <Stat
                icon={<History />}
                label="Manual rings today"
                value={
                  history.filter(
                    (item) =>
                      new Date(item.id).toDateString() === clockNow.toDateString()
                  ).length
                }
              />
            </section>

            <section className="dashboard-grid">
              <div className="content-card schedule-card">
                <div className="section-heading">
                  <div>
                    <h2>Today's schedule</h2>
                    <p>Your upcoming school bell events</p>
                  </div>
                  <button className="btn btn-outline" onClick={() => navigate("Bell Schedule")}>
                    View schedule <ChevronRight size={16} />
                  </button>
                </div>
                <div className="next-bell">
                  <div className="next-icon"><Clock size={21} /></div>
                  <div>
                    <span>NEXT BELL</span>
                    <strong>{nextBell?.name || "No upcoming bell"}</strong>
                  </div>
                  <div className="next-time">
                    <strong>{nextBell?.time || "--:--"}</strong>
                    <span>{countdown}</span>
                  </div>
                </div>
                <div className="compact-list">
                  {sortedBells
                    .filter((bell) => bell.active)
                    .slice(0, 5)
                    .map((bell) => (
                      <div className="compact-row" key={bell.id}>
                        <span className="compact-time">{bell.time}</span>
                        <span className="timeline-dot" />
                        <span className="compact-name">{bell.name}</span>
                        <span className="active-pill">Active</span>
                      </div>
                    ))}
                  {!activeBells.length && (
                    <p className="empty-state">No active bells scheduled.</p>
                  )}
                </div>
              </div>

              <div className="content-card control-card">
                <div className="section-heading">
                  <div>
                    <h2>Bell control</h2>
                    <p>Manual sound controls</p>
                  </div>
                  <span className={`connection-badge ${ringing ? "ringing-badge" : ""}`}>
                    <i /> {ringing ? "Ringing" : "Ready"}
                  </span>
                </div>
                <button
                  className={`ring-button ${ringing ? "ringing" : ""}`}
                  onClick={ringNow}
                  disabled={muted || ringing}
                >
                  <Zap size={20} /> {ringing ? "Ringing…" : "Ring now"}
                </button>
                <button
                  className="mute-button"
                  onClick={() => {
                    setMuted((value) => !value);
                    setNotice(muted ? "Bell unmuted in dashboard." : "Bell muted in dashboard.");
                  }}
                >
                  <span className="mute-icon">
                    {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </span>
                  <span>
                    <strong>{muted ? "Unmute bell" : "Mute bell"}</strong>
                    <small>
                      {muted ? "Bell controls are muted" : "Temporarily disable ringing"}
                    </small>
                  </span>
                  <span className={`switch ${muted ? "switch-on" : ""}`}><i /></span>
                </button>
                <p className="control-footnote">Connected to cloud backend · ESP32 polls every 2s</p>
              </div>
            </section>
          </>
        )}

        {page === "Bell Schedule" && (
          <section className="content-card full-card">
            <div className="section-heading">
              <div>
                <h2>Bell timetable</h2>
                <p>
                  {activeBells.length} active of {bells.length} scheduled events
                </p>
              </div>
              <button className="btn btn-primary" onClick={openAddModal}>
                <Plus size={18} /> Add bell
              </button>
            </div>
            <div className="table-scroll">
              <table className="bell-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Event name</th>
                    <th>Status</th>
                    <th className="actions-head">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBells.map((bell) => (
                    <tr key={bell.id}>
                      <td>
                        <span className="table-time">
                          <Clock size={15} />
                          {bell.time}
                        </span>
                      </td>
                      <td className="table-event">{bell.name}</td>
                      <td>
                        <button
                          className={`status-toggle ${bell.active ? "status-on" : ""}`}
                          onClick={() => toggleBell(bell.id)}
                        >
                          <i />
                          {bell.active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="action-btn edit-action"
                            onClick={() => openEditModal(bell)}
                            title="Edit bell"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="action-btn delete-action"
                            onClick={() => deleteBell(bell.id)}
                            title="Delete bell"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!sortedBells.length && (
                    <tr>
                      <td colSpan="4" className="empty-state">
                        No bells yet. Add your first bell.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {page === "Ring History" && (
          <section className="content-card full-card">
            <div className="section-heading">
              <div>
                <h2>Ring history</h2>
                <p>{history.length} recent manual ring records</p>
              </div>
              <button
                className="btn btn-outline"
                onClick={clearHistory}
                disabled={!history.length}
              >
                <Trash2 size={16} /> Clear history
              </button>
            </div>
            {history.length ? (
              <div className="history-list">
                {history.map((item) => (
                  <div className="history-row" key={item.id}>
                    <div className="history-icon"><Bell size={19} /></div>
                    <div>
                      <strong>{item.name}</strong>
                      <span>Manual control</span>
                    </div>
                    <time>{item.time}</time>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-history">
                <History size={35} />
                <strong>No ring history yet</strong>
                <span>Manual ring activity will appear here.</span>
              </div>
            )}
          </section>
        )}
      </main>

      {modalOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <form className="bell-modal" onSubmit={saveBell}>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {editingId !== null ? "UPDATE EVENT" : "NEW EVENT"}
                </span>
                <h2>{editingId !== null ? "Edit bell" : "Add a bell"}</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-field">
              <label htmlFor="bell-hour">Bell time</label>
              <div className="time-picker">
                <select
                  id="bell-hour"
                  value={form.hour12}
                  onChange={(e) => setForm({ ...form, hour12: e.target.value })}
                  aria-label="Hour"
                >
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(
                    (h) => (
                      <option key={h} value={h}>{h}</option>
                    )
                  )}
                </select>
                <span className="time-sep">:</span>
                <select
                  id="bell-minute"
                  value={form.minute}
                  onChange={(e) => setForm({ ...form, minute: e.target.value })}
                  aria-label="Minute"
                >
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(
                    (m) => (
                      <option key={m} value={m}>{m}</option>
                    )
                  )}
                </select>
                <select
                  id="bell-period"
                  value={form.period}
                  onChange={(e) => setForm({ ...form, period: e.target.value })}
                  aria-label="Period"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>

            <div className="modal-field">
              <label htmlFor="bell-name">Event name</label>
              <input
                id="bell-name"
                required
                maxLength={70}
                value={form.name}
                placeholder="e.g. Morning Assembly"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <label className="modal-check">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Enable this bell
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                <Check size={17} /> Save bell
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value, note }) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </div>
    </article>
  );
}

export default App;