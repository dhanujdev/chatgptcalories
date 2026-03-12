import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import type {
  DashboardSnapshot,
  MealSlot,
  ToolPayload,
  WeeklyTrendPoint,
} from "../../shared/types.js";
import "./styles.css";

/* ────────────────────────────────────────────────────────────
   RPC / Bridge types
   ──────────────────────────────────────────────────────────── */

type RpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

type RpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { message?: string };
};

type RpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

type ToolResultEnvelope = {
  structuredContent?: ToolPayload | null;
  content?: unknown;
  _meta?: unknown;
};

type WidgetState = {
  activeDate: string;
  mealSlot: MealSlot;
  composer: string;
};

type OpenAiBridge = {
  toolOutput?: ToolPayload | ToolResultEnvelope | null;
  widgetState?: WidgetState | null;
  locale?: string;
  callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  sendFollowUpMessage?: (args: { prompt: string; scrollToBottom?: boolean }) => Promise<void>;
  uploadFile?: (file: File) => Promise<{ fileId: string }>;
  getFileDownloadUrl?: (args: { fileId: string }) => Promise<{ downloadUrl: string }>;
  requestDisplayMode?: (args: {
    mode: "inline" | "fullscreen" | "pip";
  }) => Promise<{ mode: string }>;
  requestClose?: () => Promise<void> | void;
  setWidgetState?: (state: WidgetState) => Promise<void> | void;
};

type SetGlobalsEvent = CustomEvent<{
  globals?: Partial<OpenAiBridge>;
}>;

declare global {
  interface Window {
    openai?: OpenAiBridge;
  }
}

/* ────────────────────────────────────────────────────────────
   Utilities
   ──────────────────────────────────────────────────────────── */

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(isoDate: string, delta: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function formatDate(date: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale ?? "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/* ────────────────────────────────────────────────────────────
   Payload helpers
   ──────────────────────────────────────────────────────────── */

function extractDashboard(payload: ToolPayload | null | undefined): DashboardSnapshot | null {
  if (!payload || typeof payload !== "object") return null;
  if (payload.kind === "dashboard" && payload.dashboard) return payload.dashboard;
  if ("dashboard" in payload && (payload as Record<string, unknown>).dashboard) {
    return (payload as Record<string, unknown>).dashboard as DashboardSnapshot;
  }
  return null;
}

function unwrapToolPayload(raw: unknown): ToolPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Record<string, unknown>;

  if ("structuredContent" in payload) {
    const sc = payload.structuredContent;
    if (sc && typeof sc === "object") return sc as ToolPayload;
    return null;
  }

  if ("kind" in payload) return payload as ToolPayload;

  return null;
}

/* ────────────────────────────────────────────────────────────
   MCP Bridge hook
   ──────────────────────────────────────────────────────────── */

function useMcpBridge(onPayload: (payload: ToolPayload) => void) {
  const handlerRef = useRef(onPayload);
  const pendingRef = useRef(
    new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  );
  const nextIdRef = useRef(1);
  const [ready, setReady] = useState(() => typeof window.openai?.callTool === "function");

  useEffect(() => {
    handlerRef.current = onPayload;
  }, [onPayload]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<RpcResponse | RpcNotification>) => {
      if (event.source !== window.parent) {
        return;
      }

      const message = event.data;
      if (!message || message.jsonrpc !== "2.0") {
        return;
      }

      if ("id" in message && typeof message.id === "number") {
        const pending = pendingRef.current.get(message.id);
        if (!pending) {
          return;
        }
        pendingRef.current.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message ?? "RPC request failed"));
          return;
        }
        pending.resolve(message.result);
        return;
      }

      if (
        "method" in message &&
        message.method === "ui/notifications/tool-result" &&
        "params" in message &&
        message.params
      ) {
        const payload = unwrapToolPayload(message.params as ToolPayload | ToolResultEnvelope);
        if (payload) {
          handlerRef.current(payload);
        }
      }
    };

    window.addEventListener("message", handleMessage, { passive: true });
    const handleSetGlobals = (event: Event) => {
      const customEvent = event as SetGlobalsEvent;
      if (typeof customEvent.detail?.globals?.callTool === "function") {
        setReady(true);
      }
    };
    window.addEventListener("openai:set_globals", handleSetGlobals, { passive: true });

    if (window.parent === window) {
      return () => {
        window.removeEventListener("message", handleMessage);
        window.removeEventListener("openai:set_globals", handleSetGlobals);
      };
    }

    const rpcRequest = (method: string, params?: unknown) =>
      new Promise<unknown>((resolve, reject) => {
        const id = nextIdRef.current++;
        pendingRef.current.set(id, { resolve, reject });
        const message: RpcRequest = { jsonrpc: "2.0", id, method, params };
        window.parent.postMessage(message, "*");
      });

    const rpcNotify = (method: string, params?: unknown) => {
      const message: RpcNotification = { jsonrpc: "2.0", method, params };
      window.parent.postMessage(message, "*");
    };

    void rpcRequest("ui/initialize", {
      appInfo: { name: "chatgpt-calories", version: "0.1.0" },
      appCapabilities: {},
      protocolVersion: "2026-01-26",
    })
      .then(() => {
        rpcNotify("ui/notifications/initialized", {});
        setReady(true);
      })
      .catch(() => {
        setReady(typeof window.openai?.callTool === "function");
      });

    const pending = pendingRef.current;
    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("openai:set_globals", handleSetGlobals);
      pending.clear();
    };
  }, []);

  const callTool = async (name: string, args: Record<string, unknown>) => {
    if (window.openai?.callTool) {
      const result = await window.openai.callTool(name, args);
      return result as { structuredContent?: ToolPayload };
    }

    if (ready && window.parent !== window) {
      const id = nextIdRef.current++;
      const payload: RpcRequest = {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: args },
      };
      const result = await new Promise<unknown>((resolve, reject) => {
        pendingRef.current.set(id, {
          resolve,
          reject,
        });
        window.parent.postMessage(payload, "*");
      });
      return result as { structuredContent?: ToolPayload };
    }

    throw new Error("Host bridge is unavailable.");
  };

  return { ready, callTool };
}

/* ────────────────────────────────────────────────────────────
   Display components
   ──────────────────────────────────────────────────────────── */

function CalorieRing({
  remaining,
  consumed,
  target,
}: {
  remaining: number;
  consumed: number;
  target: number;
}) {
  const radius = 85;
  const circumference = 2 * Math.PI * radius;
  const pct = clamp(consumed / Math.max(target, 1), 0, 1);
  const offset = circumference * (1 - pct);
  const isOver = consumed > target;

  return (
    <div className="ring-wrap">
      <svg viewBox="0 0 200 200">
        <circle className="ring-track" cx="100" cy="100" r={radius} />
        <circle
          className={`ring-fill${isOver ? " ring-fill--over" : ""}`}
          cx="100"
          cy="100"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-center__value">{Math.round(remaining)}</span>
        <span className="ring-center__label">kcal remaining</span>
      </div>
    </div>
  );
}

function MacroCard({
  label,
  remaining,
  consumed,
  target,
  color,
}: {
  label: string;
  remaining: number;
  consumed: number;
  target: number;
  color: string;
}) {
  const pct = clamp(consumed / Math.max(target, 1), 0, 1);
  return (
    <div className="card macro-card">
      <div className="macro-card__label">{label}</div>
      <div className="macro-card__value" style={{ color }}>
        {Math.round(remaining)}
      </div>
      <div className="macro-card__unit">g remaining</div>
      <div className="macro-card__bar">
        <div
          className="macro-card__bar-fill"
          style={{ width: `${pct * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}

function CompactTrend({ points }: { points: WeeklyTrendPoint[] }) {
  const maxVal = Math.max(...points.map((p) => Math.max(p.target, p.calories)), 1);
  return (
    <div className="card trend-card">
      <div className="trend-card__title">Last 7 days</div>
      <div className="trend-bars">
        {points.map((p) => {
          const height = (p.calories / maxVal) * 100;
          const over = p.calories > p.target;
          return (
            <div className="trend-col" key={p.date}>
              <div
                className={`trend-bar ${over ? "trend-bar--over" : "trend-bar--under"}`}
                style={{ height: `${height}%` }}
              />
              <span className="trend-day">
                {new Date(`${p.date}T12:00:00Z`)
                  .toLocaleDateString("en-US", { weekday: "short" })
                  .slice(0, 2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   App
   ──────────────────────────────────────────────────────────── */

function App() {
  const initialPayload = unwrapToolPayload(window.openai?.toolOutput);
  const initialDashboard = extractDashboard(initialPayload);

  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(initialDashboard);
  const [activeDate, setActiveDate] = useState(
    window.openai?.widgetState?.activeDate ?? initialDashboard?.date ?? todayDate()
  );
  const [status, setStatus] = useState("Ready");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const didAutoHydrateRef = useRef(false);

  const locale = window.openai?.locale ?? "en-US";

  const applyPayload = useCallback((payload: ToolPayload) => {
    if (payload.kind === "dashboard") {
      setDashboard(payload.dashboard);
      setActiveDate(payload.dashboard.date);
    }
  }, []);

  const bridge = useMcpBridge(applyPayload);

  /* Hydrate from host: poll + set_globals event, stop once dashboard found */
  const hydratedRef = useRef(!!initialDashboard);

  useEffect(() => {
    if (hydratedRef.current) return;

    const tryHydrate = () => {
      if (hydratedRef.current) return;
      try {
        const payload = unwrapToolPayload(window.openai?.toolOutput);
        if (payload) {
          applyPayload(payload);
          hydratedRef.current = true;
          cleanup();
        }
        const ws = window.openai?.widgetState as WidgetState | null;
        if (ws?.activeDate) {
          setActiveDate(ws.activeDate);
        }
      } catch {
        /* host returned unexpected data shape */
      }
    };

    const onSetGlobals = () => tryHydrate();
    window.addEventListener("openai:set_globals", onSetGlobals, { passive: true });
    const timer = window.setInterval(tryHydrate, 300);

    const cleanup = () => {
      window.removeEventListener("openai:set_globals", onSetGlobals);
      window.clearInterval(timer);
    };

    tryHydrate();
    return cleanup;
  }, [applyPayload]);

  /* Persist widget state for host */
  useEffect(() => {
    const nextState: WidgetState = { activeDate, mealSlot: "lunch", composer: "" };
    void window.openai?.setWidgetState?.(nextState);
  }, [activeDate]);

  const runTool = useCallback(
    async (busyToken: string, nextStatus: string, name: string, args: Record<string, unknown>) => {
      setBusyKey(busyToken);
      setStatus(nextStatus);
      try {
        const response = await bridge.callTool(name, args);
        const payload = unwrapToolPayload(response as ToolPayload | ToolResultEnvelope | null);
        if (payload?.kind) {
          applyPayload(payload);
        }
        setStatus("Synced");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Tool call failed");
      } finally {
        setBusyKey((current) => (current === busyToken ? null : current));
      }
    },
    [bridge, applyPayload]
  );

  const hydrateDashboard = useCallback(
    async (force = false) => {
      if (!bridge.ready) {
        setStatus("Bridge connecting");
        return;
      }
      if (!force && didAutoHydrateRef.current) {
        return;
      }

      didAutoHydrateRef.current = true;
      await runTool("hydrate", "Loading dashboard", "open_calorie_dashboard", {
        date: activeDate,
      });
    },
    [activeDate, bridge.ready, runTool]
  );

  useEffect(() => {
    if (dashboard || !bridge.ready) {
      return;
    }
    void hydrateDashboard();
  }, [dashboard, bridge.ready, hydrateDashboard]);

  async function handleDateChange(delta: number) {
    const nextDate = shiftDate(activeDate, delta);
    await runTool("day-swap", `Loading ${nextDate}`, "load_day_snapshot", {
      date: nextDate,
    });
  }

  /* ── Empty state ───────────────────────────────────────── */

  if (!dashboard) {
    return (
      <main className="shell shell--empty">
        <div className="card empty-card">
          <h1>Calorie Command</h1>
          <p>Open the dashboard from ChatGPT to see your calories.</p>
          <button
            type="button"
            className="cta"
            disabled={busyKey === "hydrate" || !bridge.ready}
            onClick={() => void hydrateDashboard(true)}
          >
            {busyKey === "hydrate" ? "Loading..." : "Load dashboard"}
          </button>
          <p className="empty-card__hint">{bridge.ready ? status : "Connecting..."}</p>
        </div>
      </main>
    );
  }

  /* ── Dashboard ─────────────────────────────────────────── */

  const { summary, weeklyTrend } = dashboard;

  return (
    <main className="shell">
      {/* Header */}
      <header className="header">
        <span className="header__date">{formatDate(dashboard.date, locale)}</span>
        <div className="header__nav">
          <button
            type="button"
            className="nav-btn"
            onClick={() => void handleDateChange(-1)}
          >
            &larr;
          </button>
          <button
            type="button"
            className="nav-btn"
            onClick={() => void handleDateChange(1)}
          >
            &rarr;
          </button>
        </div>
      </header>

      {/* Hero: Calorie Ring */}
      <section className="card hero-card">
        <CalorieRing
          remaining={summary.remaining.calories}
          consumed={summary.totals.calories}
          target={summary.targets.calories}
        />
        <p className="hero-subtitle">
          {Math.round(summary.totals.calories)} of {summary.targets.calories} kcal consumed
        </p>
      </section>

      {/* Macro Cards */}
      <div className="macro-row">
        <MacroCard
          label="Protein"
          remaining={summary.remaining.protein}
          consumed={summary.totals.protein}
          target={summary.targets.protein}
          color="var(--protein)"
        />
        <MacroCard
          label="Carbs"
          remaining={summary.remaining.carbs}
          consumed={summary.totals.carbs}
          target={summary.targets.carbs}
          color="var(--carbs)"
        />
        <MacroCard
          label="Fat"
          remaining={summary.remaining.fat}
          consumed={summary.totals.fat}
          target={summary.targets.fat}
          color="var(--fat)"
        />
      </div>

      {/* Compact Trend */}
      <CompactTrend points={weeklyTrend} />

      {/* Streak Badge */}
      <div className="card streak-card">
        <div className="streak-card__left">
          <span className="streak-card__days">{summary.streak} day streak</span>
          <span className="streak-card__momentum">{summary.momentumLabel}</span>
        </div>
        <div>
          <div className="streak-card__score">{summary.adherenceScore}</div>
          <div className="streak-card__score-label">adherence</div>
        </div>
      </div>

      {/* Coach Note */}
      {summary.coachNote && <p className="coach-note">{summary.coachNote}</p>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
