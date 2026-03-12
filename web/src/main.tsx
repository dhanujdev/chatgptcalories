import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import type {
  CatalogResult,
  DashboardSnapshot,
  GoalTargets,
  MacroTotals,
  MealEntry,
  MealGroup,
  MealSlot,
  ToolPayload,
  WeeklyTrendPoint,
} from "../../shared/types.js";
import "./styles.css";

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

function fraction(value: number, target: number): number {
  if (target <= 0) {
    return 0;
  }
  return clamp(value / target, 0, 1.2);
}

function extractDashboard(payload: ToolPayload | null | undefined): DashboardSnapshot | null {
  return payload?.kind === "dashboard" ? payload.dashboard : null;
}

function extractSearchResults(payload: ToolPayload | null | undefined): CatalogResult[] {
  return payload?.kind === "catalogSearch" ? payload.results : [];
}

function unwrapToolPayload(
  payload: ToolPayload | ToolResultEnvelope | null | undefined
): ToolPayload | null {
  if (!payload) {
    return null;
  }

  if ("structuredContent" in payload) {
    return payload.structuredContent ?? null;
  }

  return payload;
}

function macroLabel(macro: keyof MacroTotals): string {
  switch (macro) {
    case "protein":
      return "Protein";
    case "carbs":
      return "Carbs";
    case "fat":
      return "Fat";
    case "fiber":
      return "Fiber";
    default:
      return "Calories";
  }
}

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

      if (message.method === "ui/notifications/tool-result" && message.params) {
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

  const sendFollowUp = async (prompt: string) => {
    if (window.openai?.sendFollowUpMessage) {
      await window.openai.sendFollowUpMessage({ prompt, scrollToBottom: true });
      return;
    }

    if (ready && window.parent !== window) {
      const message: RpcNotification = {
        jsonrpc: "2.0",
        method: "ui/message",
        params: {
          role: "user",
          content: [{ type: "text", text: prompt }],
        },
      };
      window.parent.postMessage(message, "*");
      return;
    }

    throw new Error("Follow-up messaging is unavailable.");
  };

  return { ready, callTool, sendFollowUp };
}

function MacroMeter({
  label,
  value,
  target,
  accent,
}: {
  label: string;
  value: number;
  target: number;
  accent: string;
}) {
  const pct = fraction(value, target);
  return (
    <div className="macro-meter">
      <div className="macro-meter__head">
        <span>{label}</span>
        <strong>
          {Math.round(value)} / {Math.round(target)}
        </strong>
      </div>
      <div className="macro-meter__track">
        <div
          className="macro-meter__fill"
          style={{
            width: `${Math.min(pct, 1) * 100}%`,
            background: accent,
          }}
        />
      </div>
    </div>
  );
}

function TrendBars({ points }: { points: WeeklyTrendPoint[] }) {
  const maxValue = Math.max(...points.map((point) => Math.max(point.target, point.calories)), 1);
  return (
    <div className="trend">
      {points.map((point) => (
        <div className="trend__column" key={point.date}>
          <div className="trend__bars">
            <div
              className="trend__bar trend__bar--target"
              style={{ height: `${(point.target / maxValue) * 100}%` }}
            />
            <div
              className="trend__bar trend__bar--actual"
              style={{ height: `${(point.calories / maxValue) * 100}%` }}
            />
          </div>
          <span>
            {new Date(`${point.date}T12:00:00Z`)
              .toLocaleDateString("en-US", { weekday: "short" })
              .slice(0, 2)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EntryRow({ entry, onRemove }: { entry: MealEntry; onRemove: (entry: MealEntry) => void }) {
  return (
    <button className="entry-row" type="button" onClick={() => onRemove(entry)}>
      <div>
        <p className="entry-row__title">{entry.label}</p>
        <p className="entry-row__meta">
          {entry.servingText}
          {entry.photoStatus === "pending" ? " · pending photo estimate" : ""}
        </p>
      </div>
      <div className="entry-row__stats">
        <strong>{Math.round(entry.macros.calories)} kcal</strong>
        <span>{Math.round(entry.macros.protein)}p</span>
      </div>
    </button>
  );
}

function MealSection({
  group,
  onRemove,
}: {
  group: MealGroup;
  onRemove: (entry: MealEntry) => void;
}) {
  return (
    <section className="meal-section">
      <div className="meal-section__head">
        <div>
          <span className="eyebrow">{group.label}</span>
          <h3>{group.mealSlot}</h3>
        </div>
        <div className="meal-section__totals">
          <strong>{Math.round(group.totals.calories)} kcal</strong>
          <span>{Math.round(group.totals.protein)}p</span>
        </div>
      </div>
      {group.entries.length === 0 ? (
        <div className="meal-section__empty">Nothing logged yet.</div>
      ) : (
        <div className="meal-section__rows">
          {group.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onRemove={onRemove} />
          ))}
        </div>
      )}
    </section>
  );
}

function App() {
  const initialPayload = unwrapToolPayload(window.openai?.toolOutput);
  const initialDashboard = extractDashboard(initialPayload);
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(initialDashboard);
  const [catalogResults, setCatalogResults] = useState<CatalogResult[]>(
    extractSearchResults(initialPayload)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [composer, setComposer] = useState(window.openai?.widgetState?.composer ?? "");
  const [mealSlot, setMealSlot] = useState<MealSlot>(
    window.openai?.widgetState?.mealSlot ?? "lunch"
  );
  const [activeDate, setActiveDate] = useState(
    window.openai?.widgetState?.activeDate ?? initialDashboard?.date ?? todayDate()
  );
  const [status, setStatus] = useState("Ready");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const didAutoHydrateRef = useRef(false);
  const [goalDraft, setGoalDraft] = useState<GoalTargets>(
    initialDashboard?.summary.targets ?? {
      calories: 2200,
      protein: 180,
      carbs: 190,
      fat: 70,
      fiber: 30,
    }
  );

  const deferredQuery = useDeferredValue(searchQuery.trim());
  const locale = window.openai?.locale ?? "en-US";

  const applyPayload = useCallback((payload: ToolPayload) => {
    if (payload.kind === "dashboard") {
      setDashboard(payload.dashboard);
      setActiveDate(payload.dashboard.date);
      setGoalDraft(payload.dashboard.summary.targets);
      return;
    }

    if (payload.kind === "catalogSearch") {
      setCatalogResults(payload.results);
    }
  }, []);

  const bridge = useMcpBridge(applyPayload);

  useEffect(() => {
    let cancelled = false;
    let pollAttempts = 0;
    let pollTimer: number | null = null;

    const stopPolling = () => {
      if (pollTimer != null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const hydrateFromHost = (globals?: Partial<OpenAiBridge>) => {
      if (cancelled) {
        return;
      }

      const source = globals ?? window.openai;
      const payload = unwrapToolPayload(source?.toolOutput);
      if (payload) {
        applyPayload(payload);
      }

      const hostState = source?.widgetState;
      if (hostState) {
        setComposer(hostState.composer ?? "");
        setMealSlot(hostState.mealSlot ?? "lunch");
        setActiveDate(hostState.activeDate ?? todayDate());
      }

      if (payload) {
        stopPolling();
      }
    };

    const handleSetGlobals = (event: Event) => {
      const customEvent = event as SetGlobalsEvent;
      hydrateFromHost(customEvent.detail?.globals);
    };

    window.addEventListener("openai:set_globals", handleSetGlobals, {
      passive: true,
    });
    hydrateFromHost();
    pollTimer = window.setInterval(() => {
      pollAttempts += 1;
      hydrateFromHost();
      if (pollAttempts >= 120) {
        stopPolling();
      }
    }, 250);

    return () => {
      cancelled = true;
      stopPolling();
      window.removeEventListener("openai:set_globals", handleSetGlobals);
    };
  }, [applyPayload]);

  useEffect(() => {
    const nextState: WidgetState = { activeDate, mealSlot, composer };
    void window.openai?.setWidgetState?.(nextState);
  }, [activeDate, mealSlot, composer]);

  useEffect(() => {
    if (deferredQuery.length < 2) {
      setCatalogResults([]);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setBusyKey("search");
      setStatus(`Searching "${deferredQuery}"`);
      void bridge
        .callTool("search_food_catalog", { query: deferredQuery, limit: 6 })
        .then((response) => {
          const payload = unwrapToolPayload(response as ToolPayload | ToolResultEnvelope);
          if (!cancelled && payload) {
            applyPayload(payload);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setStatus("Food search failed");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setBusyKey((current) => (current === "search" ? null : current));
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [bridge, deferredQuery, applyPayload]);

  const calorieFraction = dashboard
    ? fraction(dashboard.summary.totals.calories, dashboard.summary.targets.calories)
    : 0;

  const heroStyle = useMemo(
    () => ({
      background: `conic-gradient(#ff6b3d ${Math.min(calorieFraction, 1) * 360}deg, rgba(255,107,61,0.16) 0deg)`,
    }),
    [calorieFraction]
  );

  const runTool = useCallback(
    async (busyToken: string, nextStatus: string, name: string, args: Record<string, unknown>) => {
      setBusyKey(busyToken);
      setStatus(nextStatus);
      try {
        const response = await bridge.callTool(name, args);
        const payload = (response as { structuredContent?: ToolPayload }).structuredContent;
        if (payload) {
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

  async function handleQuickLog() {
    if (!composer.trim()) {
      return;
    }

    await runTool("quick-log", "Logging meal", "log_meal_from_text", {
      date: activeDate,
      mealSlot,
      description: composer.trim(),
      dedupeKey: `${activeDate}:${mealSlot}:${composer.trim().toLowerCase()}`,
    });
    setComposer("");
  }

  async function handleCatalogPick(item: CatalogResult) {
    await runTool("catalog-log", "Adding food", "log_food_selection", {
      date: activeDate,
      mealSlot,
      foodId: item.id,
      servings: 1,
      dedupeKey: `${activeDate}:${mealSlot}:${item.id}`,
    });
    setSearchQuery("");
    setCatalogResults([]);
  }

  async function handleDateChange(delta: number) {
    const nextDate = shiftDate(activeDate, delta);
    await runTool("day-swap", `Loading ${nextDate}`, "load_day_snapshot", {
      date: nextDate,
    });
  }

  async function handleSaveTargets() {
    await runTool("targets", "Saving targets", "update_goal_targets", {
      date: activeDate,
      ...goalDraft,
    });
  }

  async function handleRemove(entry: MealEntry) {
    const confirmed = window.confirm(`Remove ${entry.label}?`);
    if (!confirmed) {
      return;
    }

    await runTool("remove-entry", "Removing entry", "remove_meal_entry", {
      date: activeDate,
      entryId: entry.id,
    });
  }

  async function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !window.openai?.uploadFile || !window.openai?.getFileDownloadUrl) {
      setStatus("Photo upload is unavailable in this context");
      return;
    }

    setBusyKey("photo");
    setStatus("Uploading meal photo");
    try {
      const { fileId } = await window.openai.uploadFile(file);
      const { downloadUrl } = await window.openai.getFileDownloadUrl({ fileId });
      await runTool("photo", "Estimating from photo", "analyze_meal_photo", {
        date: activeDate,
        mealSlot,
        photo: {
          file_id: fileId,
          download_url: downloadUrl,
        },
      });
    } finally {
      setBusyKey((current) => (current === "photo" ? null : current));
    }
  }

  async function handleCoachPrompt() {
    if (!dashboard) {
      return;
    }

    const prompt =
      `Coach me on the rest of ${dashboard.date}. ` +
      `I have consumed ${Math.round(dashboard.summary.totals.calories)} calories and ${Math.round(dashboard.summary.totals.protein)}g protein. ` +
      `I have ${Math.round(dashboard.summary.remaining.calories)} calories and ${Math.round(dashboard.summary.remaining.protein)}g protein remaining. ` +
      `Keep it practical and specific to my logged meals.`;

    try {
      await bridge.sendFollowUp(prompt);
      setStatus("Sent a coaching prompt to ChatGPT");
    } catch {
      setStatus("Coach prompt is unavailable");
    }
  }

  async function handleFullscreen() {
    if (!window.openai?.requestDisplayMode) {
      setStatus("Fullscreen is unavailable");
      return;
    }

    const result = await window.openai.requestDisplayMode({ mode: "fullscreen" });
    setStatus(`Display mode: ${result.mode}`);
  }

  if (!dashboard) {
    return (
      <main className="shell shell--empty">
        <div className="panel empty-state">
          <span className="eyebrow">ChatGPT calories</span>
          <h1>Open the dashboard from ChatGPT to hydrate the widget.</h1>
          <p>This shell is ready, but it needs a tool result to render the calorie tracker.</p>
          <div className="empty-state__actions">
            <button
              type="button"
              className="cta"
              disabled={busyKey === "hydrate" || !bridge.ready}
              onClick={() => void hydrateDashboard(true)}
            >
              {busyKey === "hydrate" ? "Loading..." : "Load dashboard"}
            </button>
          </div>
          <p className="empty-state__hint">{bridge.ready ? status : "Bridge connecting"}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="shell__glow shell__glow--one" />
      <div className="shell__glow shell__glow--two" />

      <section className="hero panel">
        <div className="hero__copy">
          <span className="eyebrow">Calorie Command</span>
          <h1>Track faster than you think.</h1>
          <p>{dashboard.summary.coachNote}</p>
          <div className="hero__meta">
            <button type="button" onClick={() => void handleDateChange(-1)}>
              Prev
            </button>
            <strong>{formatDate(dashboard.date, locale)}</strong>
            <button type="button" onClick={() => void handleDateChange(1)}>
              Next
            </button>
          </div>
        </div>

        <div className="hero__ring-wrap">
          <div className="hero__ring" style={heroStyle}>
            <div className="hero__ring-core">
              <span>Consumed</span>
              <strong>{Math.round(dashboard.summary.totals.calories)}</strong>
              <small>of {dashboard.summary.targets.calories} kcal</small>
            </div>
          </div>
          <div className="hero__badges">
            <span>{dashboard.summary.momentumLabel}</span>
            <span>{dashboard.summary.streak} day streak</span>
            <span>{dashboard.summary.adherenceScore}/100</span>
          </div>
        </div>
      </section>

      <section className="grid">
        <section className="panel composer" style={{ animationDelay: "40ms" }}>
          <div className="section-head">
            <div>
              <span className="eyebrow">Quick log</span>
              <h2>Plain English or quick add</h2>
            </div>
            <span className="status-pill">{bridge.ready ? status : "Bridge connecting"}</span>
          </div>

          <div className="composer__controls">
            <select
              value={mealSlot}
              onChange={(event) => setMealSlot(event.target.value as MealSlot)}
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
            <input
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              placeholder="2 eggs and toast, chicken bowl, protein shake..."
            />
            <button
              type="button"
              className="cta"
              disabled={busyKey === "quick-log" || composer.trim().length === 0}
              onClick={() => void handleQuickLog()}
            >
              Log it
            </button>
          </div>

          <div className="catalog">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search the quick-add catalog"
            />
            <div className="catalog__results">
              {catalogResults.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="catalog__result"
                  onClick={() => void handleCatalogPick(item)}
                >
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.servingText}</span>
                  </div>
                  <strong>{Math.round(item.macros.calories)} kcal</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="composer__actions">
            <label className="soft-button">
              <input type="file" accept="image/*" hidden onChange={handlePhotoUpload} />
              Add meal photo
            </label>
            <button type="button" className="soft-button" onClick={() => void handleCoachPrompt()}>
              Ask coach
            </button>
            <button type="button" className="soft-button" onClick={() => void handleFullscreen()}>
              Focus mode
            </button>
          </div>
        </section>

        <section className="panel metrics" style={{ animationDelay: "90ms" }}>
          <div className="section-head">
            <div>
              <span className="eyebrow">Runway</span>
              <h2>Macro pacing</h2>
            </div>
            <strong>{Math.round(dashboard.summary.remaining.calories)} kcal left</strong>
          </div>

          <div className="metric-grid">
            <MacroMeter
              label={macroLabel("protein")}
              value={dashboard.summary.totals.protein}
              target={dashboard.summary.targets.protein}
              accent="linear-gradient(90deg, #7ac7a4, #4aa383)"
            />
            <MacroMeter
              label={macroLabel("carbs")}
              value={dashboard.summary.totals.carbs}
              target={dashboard.summary.targets.carbs}
              accent="linear-gradient(90deg, #f4c15d, #d8891f)"
            />
            <MacroMeter
              label={macroLabel("fat")}
              value={dashboard.summary.totals.fat}
              target={dashboard.summary.targets.fat}
              accent="linear-gradient(90deg, #ff9d7a, #ff6b3d)"
            />
            <MacroMeter
              label={macroLabel("fiber")}
              value={dashboard.summary.totals.fiber}
              target={dashboard.summary.targets.fiber}
              accent="linear-gradient(90deg, #9cb7ff, #617dff)"
            />
          </div>

          <div className="suggestion-list">
            {dashboard.suggestions.map((suggestion) => (
              <div className="suggestion-list__item" key={suggestion}>
                {suggestion}
              </div>
            ))}
          </div>
        </section>

        <section className="panel targets" style={{ animationDelay: "140ms" }}>
          <div className="section-head">
            <div>
              <span className="eyebrow">Targets</span>
              <h2>Tune the day</h2>
            </div>
          </div>

          <div className="targets__grid">
            {(["calories", "protein", "carbs", "fat", "fiber"] as const).map((key) => (
              <label key={key}>
                <span>{macroLabel(key)}</span>
                <input
                  type="number"
                  value={goalDraft[key]}
                  onChange={(event) =>
                    setGoalDraft((current) => ({
                      ...current,
                      [key]: Number(event.target.value) || 0,
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <button type="button" className="cta" onClick={() => void handleSaveTargets()}>
            Save targets
          </button>
        </section>

        <section className="panel trend-panel" style={{ animationDelay: "190ms" }}>
          <div className="section-head">
            <div>
              <span className="eyebrow">Trend</span>
              <h2>Last 7 days</h2>
            </div>
            <span>{dashboard.summary.streak} day streak</span>
          </div>
          <TrendBars points={dashboard.weeklyTrend} />
        </section>

        <section className="panel meal-board" style={{ animationDelay: "240ms" }}>
          <div className="section-head">
            <div>
              <span className="eyebrow">Daily board</span>
              <h2>Every meal in one scroll</h2>
            </div>
            <span>
              {dashboard.mealGroups.reduce((sum, group) => sum + group.entries.length, 0)} entries
            </span>
          </div>

          <div className="meal-board__grid">
            {dashboard.mealGroups.map((group) => (
              <MealSection key={group.mealSlot} group={group} onRemove={handleRemove} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
