import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import heroImage from "./assets/hero.png";
import VideoCall from "./components/VideoCall";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || BACKEND_URL || window.location.origin).replace(
  /\/$/,
  "",
);
const API_BASE = `${BACKEND_URL}/api/v1`;

const defaultScheduleForm = {
  title: "",
  time: "09:00",
};

const getInitialMode = () => {
  const params = new URLSearchParams(window.location.search);
  return params.has("token") && window.location.pathname.includes("reset-password")
    ? "reset"
    : "login";
};

const formatApiError = (error) =>
  error?.error || error?.message || "Something went wrong. Please try again.";

const apiRequest = async (path, options = {}, allowRefresh = true) => {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if ((response.status === 401 || response.status === 403) && allowRefresh) {
    const refreshResponse = await fetch(`${API_BASE}/auth/refresh-token`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    if (refreshResponse.ok) {
      return apiRequest(path, options, false);
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw data;
  }

  return data;
};

function App() {
  const [authMode, setAuthMode] = useState(getInitialMode);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeView, setActiveView] = useState("today");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [authForm, setAuthForm] = useState({
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [pairingCode, setPairingCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [scheduleForm, setScheduleForm] = useState(defaultScheduleForm);
  const [editingId, setEditingId] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [socketStatus, setSocketStatus] = useState("offline");
  const [accountForm, setAccountForm] = useState({
    oldPassword: "",
    newPassword: "",
  });

  const tokenFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("token") || "";
  }, []);

  const activeSchedules = schedules.filter((schedule) => schedule.isActive);
  const nextSchedule = activeSchedules[0];

  const clearMessages = () => {
    setError("");
    setStatus("");
  };

  const loadAppData = useCallback(async () => {
    try {
      setLoading(true);
      const [meData, sessionData] = await Promise.all([
        apiRequest("/auth/me"),
        apiRequest("/auth/sessions"),
      ]);
      let scheduleData = { schedules: [] };

      if (meData.user?.coupleId) {
        scheduleData = await apiRequest("/schedule");
      }

      setCurrentUser(meData.user);
      setSchedules(scheduleData.schedules || []);
      setSessions(sessionData.sessions || []);
      setIsAuthenticated(true);
      setStatus("");
    } catch {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setSchedules([]);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadInitialData = window.setTimeout(() => {
      loadAppData();
    }, 0);

    return () => window.clearTimeout(loadInitialData);
  }, [loadAppData]);

  useEffect(() => {
    let nextSocket;
    const connectTimer = window.setTimeout(() => {
      if (!isAuthenticated || !currentUser?.id || !currentUser?.coupleId) {
        setSocketStatus("offline");
        setSocket(null);
        return;
      }

      setSocketStatus("connecting");

      nextSocket = io(SOCKET_URL, {
        query: {
          userId: currentUser.id,
          coupleId: currentUser.coupleId,
        },
        transports: ["websocket", "polling"],
        withCredentials: true,
      });

      const handleConnect = () => setSocketStatus("connected");
      const handleDisconnect = () => setSocketStatus("offline");
      const handleConnectError = () => setSocketStatus("error");

      nextSocket.on("connect", handleConnect);
      nextSocket.on("disconnect", handleDisconnect);
      nextSocket.on("connect_error", handleConnectError);
      setSocket(nextSocket);
    }, 0);

    return () => {
      window.clearTimeout(connectTimer);
      nextSocket?.disconnect();
    };
  }, [currentUser, isAuthenticated]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    clearMessages();

    if (authMode === "register" && authForm.password !== authForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (authMode === "reset" && !tokenFromUrl) {
      setError("Reset token is missing from the URL.");
      return;
    }

    try {
      if (authMode === "register") {
        const data = await apiRequest("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            displayName: authForm.displayName,
            email: authForm.email,
            password: authForm.password,
          }),
        });
        setStatus(data.message);
        setAuthMode("login");
      } else if (authMode === "forgot") {
        const data = await apiRequest("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: authForm.email }),
        });
        setStatus(data.message);
      } else if (authMode === "reset") {
        const data = await apiRequest("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({
            token: tokenFromUrl,
            newPassword: authForm.password,
          }),
        });
        setStatus(data.message);
        setAuthMode("login");
      } else {
        const data = await apiRequest("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: authForm.email,
            password: authForm.password,
          }),
        });
        setStatus(data.message);
        await loadAppData();
      }
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const handleLogout = async () => {
    clearMessages();
    try {
      await apiRequest("/auth/logout", { method: "POST" }, false);
    } catch {
      // Cookies may already be expired; the local app state can still clear.
    }
    setIsAuthenticated(false);
    setCurrentUser(null);
    socket?.disconnect();
    setSocket(null);
    setSocketStatus("offline");
    setAuthMode("login");
    setSchedules([]);
    setSessions([]);
  };

  const createPairingCode = async () => {
    clearMessages();
    try {
      const data = await apiRequest("/pairing/create", { method: "POST" });
      setPairingCode(data.pairingCode);
      setStatus("Share this code with your partner. It expires in 15 minutes.");
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const submitPairingCode = async (event) => {
    event.preventDefault();
    clearMessages();
    try {
      const data = await apiRequest("/pairing/submit", {
        method: "POST",
        body: JSON.stringify({ pairingCode: joinCode }),
      });
      setStatus(data.message || "Successfully paired.");
      setJoinCode("");
      await loadAppData();
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const saveSchedule = async (event) => {
    event.preventDefault();
    clearMessages();
    try {
      if (editingId) {
        const current = schedules.find((schedule) => schedule._id === editingId);
        const data = await apiRequest(`/schedule/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({
            ...scheduleForm,
            isActive: current?.isActive ?? true,
          }),
        });
        setSchedules((items) =>
          items.map((item) => (item._id === editingId ? data.schedule : item)),
        );
        setEditingId(null);
        setStatus("Reminder updated.");
      } else {
        const data = await apiRequest("/schedule", {
          method: "POST",
          body: JSON.stringify(scheduleForm),
        });
        setSchedules((items) => [...items, data.schedule].sort((a, b) => a.time.localeCompare(b.time)));
        setStatus("Reminder added.");
      }
      setScheduleForm(defaultScheduleForm);
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const editSchedule = (schedule) => {
    setEditingId(schedule._id);
    setScheduleForm({ title: schedule.title, time: schedule.time });
    setActiveView("today");
  };

  const toggleSchedule = async (schedule) => {
    clearMessages();
    try {
      const data = await apiRequest(`/schedule/${schedule._id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: schedule.title,
          time: schedule.time,
          isActive: !schedule.isActive,
        }),
      });
      setSchedules((items) =>
        items.map((item) => (item._id === schedule._id ? data.schedule : item)),
      );
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const deleteSchedule = async (scheduleId) => {
    clearMessages();
    try {
      await apiRequest(`/schedule/${scheduleId}`, { method: "DELETE" });
      setSchedules((items) => items.filter((item) => item._id !== scheduleId));
      setStatus("Reminder deleted.");
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    clearMessages();
    try {
      const data = await apiRequest("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(accountForm),
      });
      setStatus(data.message);
      setAccountForm({ oldPassword: "", newPassword: "" });
      setIsAuthenticated(false);
      setAuthMode("login");
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const logoutSession = async (sessionId) => {
    clearMessages();
    try {
      await apiRequest(`/auth/logout-session/${sessionId}`, { method: "POST" });
      setSessions((items) =>
        items.map((session) =>
          session._id === sessionId ? { ...session, revoked: true } : session,
        ),
      );
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="loading-mark">G</div>
        <p>Opening Gutur Gu...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="auth-layout">
        <section className="auth-hero">
          <div className="brand-row">
            <span className="brand-mark">G</span>
            <span>Gutur Gu</span>
          </div>
          <div className="hero-copy">
            <p className="eyebrow">Shared reminders for two</p>
            <h1>Keep the small promises close.</h1>
            <p>
              Pair with your partner, set gentle daily reminders, and manage the moments
              that should not get lost in busy days.
            </p>
          </div>
          <img src={heroImage} alt="Gutur Gu couple reminder illustration" />
        </section>

        <section className="auth-panel">
          <div className="mode-switch" role="tablist" aria-label="Authentication mode">
            <button
              className={authMode === "login" ? "active" : ""}
              onClick={() => setAuthMode("login")}
              type="button"
            >
              Login
            </button>
            <button
              className={authMode === "register" ? "active" : ""}
              onClick={() => setAuthMode("register")}
              type="button"
            >
              Register
            </button>
          </div>

          <form className="stack-form" onSubmit={handleAuthSubmit}>
            <div>
              <p className="eyebrow">{authMode === "forgot" ? "Recover" : "Welcome"}</p>
              <h2>
                {authMode === "register" && "Create your account"}
                {authMode === "login" && "Sign in to your space"}
                {authMode === "forgot" && "Reset your password"}
                {authMode === "reset" && "Choose a new password"}
              </h2>
            </div>

            {authMode === "register" && (
              <label>
                Display name
                <input
                  value={authForm.displayName}
                  onChange={(event) =>
                    setAuthForm((form) => ({ ...form, displayName: event.target.value }))
                  }
                  placeholder="Aarav"
                  required
                />
              </label>
            )}

            {authMode !== "reset" && (
              <label>
                Email
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) =>
                    setAuthForm((form) => ({ ...form, email: event.target.value }))
                  }
                  placeholder="you@example.com"
                  required
                />
              </label>
            )}

            {authMode !== "forgot" && (
              <label>
                Password
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm((form) => ({ ...form, password: event.target.value }))
                  }
                  placeholder="At least 8 characters"
                  required
                />
              </label>
            )}

            {authMode === "register" && (
              <label>
                Confirm password
                <input
                  type="password"
                  value={authForm.confirmPassword}
                  onChange={(event) =>
                    setAuthForm((form) => ({ ...form, confirmPassword: event.target.value }))
                  }
                  placeholder="Repeat password"
                  required
                />
              </label>
            )}

            {error && <p className="notice error">{error}</p>}
            {status && <p className="notice success">{status}</p>}

            <button className="primary-button" type="submit">
              {authMode === "register" && "Create account"}
              {authMode === "login" && "Login"}
              {authMode === "forgot" && "Send reset link"}
              {authMode === "reset" && "Update password"}
            </button>

            <button
              className="text-button"
              type="button"
              onClick={() => setAuthMode(authMode === "forgot" ? "login" : "forgot")}
            >
              {authMode === "forgot" ? "Back to login" : "Forgot password?"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <span className="brand-mark">G</span>
          <span>Gutur Gu</span>
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          {[
            ["today", "Today"],
            ["pair", "Pair"],
            ["account", "Account"],
          ].map(([view, label]) => (
            <button
              key={view}
              className={activeView === view ? "active" : ""}
              onClick={() => setActiveView(view)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="ghost-button" onClick={handleLogout} type="button">
          Logout
        </button>
      </aside>

      <section className="dashboard">
        <header className="topbar">
          <div>
            <p className="eyebrow">Partner reminders</p>
            <h1>{activeView === "today" ? "Today" : activeView === "pair" ? "Pairing" : "Account"}</h1>
          </div>
          <div className="topbar-actions">
            <div className={`socket-pill ${socketStatus}`}>
              {currentUser?.coupleId ? `Live ${socketStatus}` : "Pair to enable live calls"}
            </div>
            <div className="next-chip">
              <span>Next</span>
              <strong>{nextSchedule ? `${nextSchedule.time} ${nextSchedule.title}` : "No active reminder"}</strong>
            </div>
          </div>
        </header>

        {(error || status) && (
          <div className="toast-row">
            {error && <p className="notice error">{error}</p>}
            {status && <p className="notice success">{status}</p>}
          </div>
        )}

        {activeView === "today" && (
          <div className="content-grid">
            <section className="panel schedule-editor">
              <div>
                <p className="eyebrow">Create</p>
                <h2>{editingId ? "Edit reminder" : "New reminder"}</h2>
              </div>
              <form className="stack-form" onSubmit={saveSchedule}>
                <label>
                  Title
                  <input
                    value={scheduleForm.title}
                    onChange={(event) =>
                      setScheduleForm((form) => ({ ...form, title: event.target.value }))
                    }
                    placeholder="Lunch ke baad ki gutur gu"
                    required
                  />
                </label>
                <label>
                  Time
                  <input
                    type="time"
                    value={scheduleForm.time}
                    onChange={(event) =>
                      setScheduleForm((form) => ({ ...form, time: event.target.value }))
                    }
                    required
                  />
                </label>
                <div className="button-row">
                  <button className="primary-button" type="submit">
                    {editingId ? "Save changes" : "Add reminder"}
                  </button>
                  {editingId && (
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setScheduleForm(defaultScheduleForm);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="panel schedule-list">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Schedule</p>
                  <h2>{schedules.length} reminders</h2>
                </div>
                <button className="ghost-button compact" onClick={loadAppData} type="button">
                  Refresh
                </button>
              </div>
              {schedules.length === 0 ? (
                <div className="empty-state">
                  <h3>No reminders yet</h3>
                  <p>Create your first shared reminder after pairing with your partner.</p>
                </div>
              ) : (
                <div className="reminder-list">
                  {schedules.map((schedule) => (
                    <article className={!schedule.isActive ? "reminder muted" : "reminder"} key={schedule._id}>
                      <div className="time-block">{schedule.time}</div>
                      <div className="reminder-copy">
                        <h3>{schedule.title}</h3>
                        <p>{schedule.isActive ? "Active" : "Paused"}</p>
                      </div>
                      <div className="reminder-actions">
                        <button onClick={() => toggleSchedule(schedule)} type="button">
                          {schedule.isActive ? "Pause" : "Start"}
                        </button>
                        <button onClick={() => editSchedule(schedule)} type="button">
                          Edit
                        </button>
                        <button onClick={() => deleteSchedule(schedule._id)} type="button">
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeView === "pair" && (
          <div className="content-grid pair-grid">
            <section className="panel">
              <p className="eyebrow">Invite</p>
              <h2>Generate a pairing code</h2>
              <p className="muted-text">
                Share the 6 digit code with your partner. They can join from their own account.
              </p>
              <button className="primary-button" onClick={createPairingCode} type="button">
                Generate code
              </button>
              {pairingCode && <div className="pairing-code">{pairingCode}</div>}
            </section>

            <section className="panel">
              <p className="eyebrow">Join</p>
              <h2>Use partner code</h2>
              <form className="stack-form" onSubmit={submitPairingCode}>
                <label>
                  Pairing code
                  <input
                    inputMode="numeric"
                    maxLength="6"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, ""))}
                    placeholder="492015"
                    required
                  />
                </label>
                <button className="primary-button" type="submit">
                  Pair accounts
                </button>
              </form>
            </section>
          </div>
        )}

        {activeView === "account" && (
          <div className="content-grid">
            <section className="panel">
              <p className="eyebrow">Security</p>
              <h2>Change password</h2>
              <form className="stack-form" onSubmit={changePassword}>
                <label>
                  Current password
                  <input
                    type="password"
                    value={accountForm.oldPassword}
                    onChange={(event) =>
                      setAccountForm((form) => ({ ...form, oldPassword: event.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  New password
                  <input
                    type="password"
                    value={accountForm.newPassword}
                    onChange={(event) =>
                      setAccountForm((form) => ({ ...form, newPassword: event.target.value }))
                    }
                    required
                  />
                </label>
                <button className="primary-button" type="submit">
                  Change password
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Devices</p>
                  <h2>Active sessions</h2>
                </div>
                <button className="ghost-button compact" onClick={loadAppData} type="button">
                  Refresh
                </button>
              </div>
              <div className="session-list">
                {sessions.map((session) => (
                  <article className="session-row" key={session._id}>
                    <div>
                      <strong>{session.userAgent || "Unknown device"}</strong>
                      <span>
                        {session.revoked ? "Revoked" : "Active"} since{" "}
                        {new Date(session.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {!session.revoked && (
                      <button onClick={() => logoutSession(session._id)} type="button">
                        Logout
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {[
          ["today", "Today"],
          ["pair", "Pair"],
          ["account", "Account"],
        ].map(([view, label]) => (
          <button
            key={view}
            className={activeView === view ? "active" : ""}
            onClick={() => setActiveView(view)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>
      <VideoCall socket={socket} />
    </main>
  );
}

export default App;
