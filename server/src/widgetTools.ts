import { z } from "zod";

import {
  DEFAULT_GOALS,
  DEFAULT_TIMEZONE,
  MEAL_SLOT_LABELS,
  MEAL_SLOTS,
  ZERO_MACROS,
} from "../../shared/constants.js";
import {
  loadDayInput,
  logCatalogInput,
  logMealInput,
  openDashboardInput,
  removeEntryInput,
  searchFoodInput,
  setGoalsInput,
} from "../../shared/schemas.js";
import type {
  CatalogResult,
  DashboardPayload,
  DashboardSnapshot,
  GoalTargets,
  MacroTotals,
  MealEntry,
  MealGroup,
  MealSlot,
  WeeklyTrendPoint,
} from "../../shared/types.js";
import {
  getDayEntries,
  getGoals,
  getWeekEntries,
  insertFoodEntry,
  removeFoodEntry,
  upsertGoals,
} from "../supabase/queries.js";
import type { FoodEntryInsert, FoodEntryRow, UserGoalsRow } from "../supabase/types.js";
import { estimateMealFromText, findCatalogItem, searchFoodCatalog } from "./catalog.js";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(date?: string): string {
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayDate();
}

function shiftDate(isoDate: string, delta: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function addMacros(left: MacroTotals, right: MacroTotals): MacroTotals {
  return {
    calories: round(left.calories + right.calories),
    protein: round(left.protein + right.protein),
    carbs: round(left.carbs + right.carbs),
    fat: round(left.fat + right.fat),
    fiber: round(left.fiber + right.fiber),
  };
}

function scaleMacros(base: MacroTotals, factor: number): MacroTotals {
  return {
    calories: round(base.calories * factor),
    protein: round(base.protein * factor),
    carbs: round(base.carbs * factor),
    fat: round(base.fat * factor),
    fiber: round(base.fiber * factor),
  };
}

function mapTargets(goalsRow: UserGoalsRow | null): GoalTargets {
  return {
    calories: goalsRow?.daily_calories ?? DEFAULT_GOALS.calories,
    protein: goalsRow?.protein_grams ?? DEFAULT_GOALS.protein,
    carbs: goalsRow?.carbs_grams ?? DEFAULT_GOALS.carbs,
    fat: goalsRow?.fat_grams ?? DEFAULT_GOALS.fat,
    fiber: DEFAULT_GOALS.fiber,
  };
}

function toConfidenceBand(score: number | null): MealEntry["confidence"] {
  if ((score ?? 0) >= 0.85) {
    return "high";
  }
  if ((score ?? 0) >= 0.6) {
    return "medium";
  }
  return "low";
}

function toEntrySource(source: FoodEntryRow["source_kind"]): MealEntry["source"] {
  switch (source) {
    case "manual":
      return "manual";
    case "search":
      return "search";
    case "photo":
      return "photo";
    case "barcode":
      return "barcode";
    case "voice":
      return "voice";
    case "shortcut":
      return "shortcut";
    case "memory":
      return "memory";
    case "recipe":
      return "recipe";
    case "saved_meal":
      return "saved_meal";
    default:
      return "manual";
  }
}

function rowToMealEntry(row: FoodEntryRow): MealEntry {
  const label = row.display_name ?? row.food_name;
  const pendingPhoto = row.source_kind === "photo" && row.calories === 0;

  return {
    id: row.id,
    date: row.local_date,
    mealSlot: row.meal,
    source: toEntrySource(row.source_kind),
    label,
    servingText: row.serving_label ?? `${row.servings} serving${row.servings === 1 ? "" : "s"}`,
    notes: row.notes,
    confidence: toConfidenceBand(row.confidence),
    createdAt: row.created_at,
    macros: {
      calories: row.calories,
      protein: row.protein_g,
      carbs: row.carbs_g,
      fat: row.fat_g,
      fiber: row.fiber_g,
    },
    photoStatus: row.source_kind === "photo" ? (pendingPhoto ? "pending" : "analyzed") : undefined,
    photoFileId: row.source_kind === "photo" ? row.source_ref : undefined,
  };
}

function buildMealGroups(entries: MealEntry[]): MealGroup[] {
  return MEAL_SLOTS.map((mealSlot) => {
    const groupedEntries = entries.filter((entry) => entry.mealSlot === mealSlot);
    const totals = groupedEntries.reduce(
      (sum, entry) => addMacros(sum, entry.macros),
      { ...ZERO_MACROS }
    );

    return {
      mealSlot,
      label: MEAL_SLOT_LABELS[mealSlot],
      totals,
      entries: groupedEntries,
    };
  });
}

function coachNote(targets: GoalTargets, totals: MacroTotals, remaining: MacroTotals): string {
  if (remaining.calories < 0) {
    return `You are ${Math.abs(Math.round(remaining.calories))} kcal over target. Make the next meal lighter and protein-heavy.`;
  }

  if (remaining.protein > 35) {
    return `You still have ${Math.round(remaining.protein)}g of protein runway. A shake or lean bowl closes the gap fast.`;
  }

  if (totals.calories < targets.calories * 0.45) {
    return "You are still early in the day. A bigger, fiber-heavy lunch keeps the evening calmer.";
  }

  if (remaining.fiber > 10) {
    return "Fiber is still trailing. Add fruit, oats, beans, or greens to the next entry.";
  }

  return "The day is balanced. Hold steady and close with something simple.";
}

function momentumLabel(adherenceScore: number): string {
  if (adherenceScore >= 88) {
    return "Locked in";
  }
  if (adherenceScore >= 72) {
    return "On pace";
  }
  return "Needs a reset";
}

function suggestions(remaining: MacroTotals): string[] {
  const items: string[] = [];

  if (remaining.protein > 30) {
    items.push("Add a 25-30g protein anchor before the day closes.");
  }
  if (remaining.calories > 200 && remaining.calories < 450) {
    items.push("You have room for one compact meal or a measured snack.");
  }
  if (remaining.calories < 0) {
    items.push("Skip liquid calories and keep the next plate mostly lean protein plus produce.");
  }
  if (remaining.fiber > 8) {
    items.push("Fiber is under target. Fruit or oats will correct it quickly.");
  }

  return items.length > 0 ? items : ["Momentum looks good. Repeat the same structure tomorrow."];
}

function buildWeeklyTrend(entries: FoodEntryRow[], endDate: string, targetCalories: number): WeeklyTrendPoint[] {
  const byDate = new Map<string, MacroTotals>();

  for (const entry of entries) {
    const current = byDate.get(entry.local_date) ?? { ...ZERO_MACROS };
    byDate.set(entry.local_date, {
      calories: current.calories + entry.calories,
      protein: current.protein + entry.protein_g,
      carbs: current.carbs + entry.carbs_g,
      fat: current.fat + entry.fat_g,
      fiber: current.fiber + entry.fiber_g,
    });
  }

  const points: WeeklyTrendPoint[] = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const date = shiftDate(endDate, offset);
    const totals = byDate.get(date) ?? { ...ZERO_MACROS };
    points.push({
      date,
      calories: round(totals.calories),
      target: targetCalories,
      protein: round(totals.protein),
    });
  }

  return points;
}

function computeStreak(entries: FoodEntryRow[], date: string): number {
  const activeDates = new Set(entries.map((entry) => entry.local_date));
  let streak = 0;

  while (activeDates.has(shiftDate(date, -streak))) {
    streak += 1;
  }

  return streak;
}

export async function buildDashboardSnapshot(date?: string): Promise<DashboardSnapshot> {
  const nextDate = normalizeDate(date);
  const [dayRows, goalsRow, weekRows] = await Promise.all([
    getDayEntries(nextDate),
    getGoals(),
    getWeekEntries(nextDate),
  ]);

  const entries = dayRows.map(rowToMealEntry);
  const mealGroups = buildMealGroups(entries);
  const totals = mealGroups.reduce(
    (sum, group) => addMacros(sum, group.totals),
    { ...ZERO_MACROS }
  );
  const targets = mapTargets(goalsRow);
  const remaining = {
    calories: round(targets.calories - totals.calories),
    protein: round(targets.protein - totals.protein),
    carbs: round(targets.carbs - totals.carbs),
    fat: round(targets.fat - totals.fat),
    fiber: round((targets.fiber ?? 0) - totals.fiber),
  };

  const calorieAccuracy = Math.max(
    0,
    100 - Math.min(100, (Math.abs(remaining.calories) / Math.max(targets.calories, 1)) * 120)
  );
  const proteinAccuracy = Math.min(100, (totals.protein / Math.max(targets.protein, 1)) * 100);
  const adherenceScore = Math.round(calorieAccuracy * 0.6 + proteinAccuracy * 0.4);

  return {
    stateVersion: weekRows.length + dayRows.length,
    date: nextDate,
    summary: {
      date: nextDate,
      targets,
      totals,
      remaining,
      adherenceScore,
      proteinRunway: round(Math.max(remaining.protein, 0)),
      calorieDelta: round(totals.calories - targets.calories),
      streak: computeStreak(weekRows, nextDate),
      momentumLabel: momentumLabel(adherenceScore),
      coachNote: coachNote(targets, totals, remaining),
    },
    mealGroups,
    suggestions: suggestions(remaining),
    weeklyTrend: buildWeeklyTrend(weekRows, nextDate, targets.calories),
  };
}

export async function buildDashboardPayload(date?: string): Promise<DashboardPayload> {
  return {
    kind: "dashboard",
    dashboard: await buildDashboardSnapshot(date),
  };
}

export async function buildCatalogSearchPayload(query: string, limit?: number) {
  return {
    kind: "catalogSearch" as const,
    query,
    results: searchFoodCatalog(query, limit ?? 6),
  };
}

async function findExistingEntry(date: string, sourceRef: string): Promise<FoodEntryRow | null> {
  const rows = await getDayEntries(date);
  return rows.find((row) => row.source_ref === sourceRef) ?? null;
}

export async function logTextMealAndBuildDashboard(args: {
  date?: string;
  mealSlot?: MealSlot;
  description: string;
  dedupeKey?: string;
}) {
  const nextDate = normalizeDate(args.date);
  const nextMealSlot = args.mealSlot ?? "lunch";
  const estimate = estimateMealFromText(args.description, nextMealSlot);

  if (args.dedupeKey) {
    const existing = await findExistingEntry(nextDate, args.dedupeKey);
    if (existing) {
      return {
        payload: await buildDashboardPayload(nextDate),
        label: existing.display_name ?? existing.food_name,
        reused: true,
      };
    }
  }

  const entry: FoodEntryInsert = {
    user_id: "00000000-0000-0000-0000-000000000000",
    status: "committed",
    meal: nextMealSlot,
    food_name: args.description,
    display_name: estimate.label,
    servings: 1,
    serving_label: estimate.servingText,
    calories: estimate.macros.calories,
    protein_g: estimate.macros.protein,
    carbs_g: estimate.macros.carbs,
    fat_g: estimate.macros.fat,
    fiber_g: estimate.macros.fiber,
    source_kind: "manual",
    source_ref: args.dedupeKey ?? null,
    provenance: estimate.confidence === "high" ? "catalog_resolved" : "estimated",
    confidence: estimate.confidence === "high" ? 0.9 : estimate.confidence === "medium" ? 0.7 : 0.4,
    occurred_at: new Date().toISOString(),
    local_date: nextDate,
    timezone: DEFAULT_TIMEZONE,
    notes: estimate.notes,
  };

  await insertFoodEntry(entry);

  return {
    payload: await buildDashboardPayload(nextDate),
    label: estimate.label,
    reused: false,
  };
}

export async function logCatalogSelectionAndBuildDashboard(args: {
  date?: string;
  mealSlot: MealSlot;
  foodId: string;
  servings?: number;
  dedupeKey?: string;
}) {
  const nextDate = normalizeDate(args.date);
  const servings = Math.max(0.5, Math.min(args.servings ?? 1, 4));
  const item = findCatalogItem(args.foodId);

  if (!item) {
    throw new Error(`Food "${args.foodId}" was not found in the catalog.`);
  }

  if (args.dedupeKey) {
    const existing = await findExistingEntry(nextDate, args.dedupeKey);
    if (existing) {
      return {
        payload: await buildDashboardPayload(nextDate),
        label: existing.display_name ?? existing.food_name,
        reused: true,
      };
    }
  }

  const scaled = scaleMacros(item.macros, servings);
  const entry: FoodEntryInsert = {
    user_id: "00000000-0000-0000-0000-000000000000",
    status: "committed",
    meal: args.mealSlot,
    food_name: item.name,
    display_name: item.name,
    servings,
    serving_label: servings === 1 ? item.servingText : `${servings} x ${item.servingText}`,
    calories: scaled.calories,
    protein_g: scaled.protein,
    carbs_g: scaled.carbs,
    fat_g: scaled.fat,
    fiber_g: scaled.fiber,
    source_kind: "search",
    source_ref: args.dedupeKey ?? args.foodId,
    provenance: "catalog_resolved",
    confidence: 0.95,
    occurred_at: new Date().toISOString(),
    local_date: nextDate,
    timezone: DEFAULT_TIMEZONE,
    notes: null,
  };

  await insertFoodEntry(entry);

  return {
    payload: await buildDashboardPayload(nextDate),
    label: item.name,
    reused: false,
  };
}

export async function updateGoalTargetsAndBuildDashboard(args: {
  date?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
}) {
  const nextDate = normalizeDate(args.date);
  const update: Record<string, number> = {};

  if (args.calories !== undefined) update.daily_calories = args.calories;
  if (args.protein !== undefined) update.protein_grams = args.protein;
  if (args.carbs !== undefined) update.carbs_grams = args.carbs;
  if (args.fat !== undefined) update.fat_grams = args.fat;

  if (Object.keys(update).length > 0) {
    await upsertGoals(update);
  }

  return {
    payload: await buildDashboardPayload(nextDate),
    fiberSaved: args.fiber === undefined || args.fiber === DEFAULT_GOALS.fiber,
  };
}

export async function removeMealEntryAndBuildDashboard(args: { entryId: string; date?: string }) {
  const nextDate = normalizeDate(args.date);
  const removed = await removeFoodEntry(args.entryId);

  return {
    payload: await buildDashboardPayload(nextDate),
    removed,
  };
}

export const analyzeMealPhotoInput = {
  date: z.string().optional(),
  mealSlot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  photo: z.object({
    file_id: z.string().min(1),
    download_url: z.string().url(),
  }),
};

export async function analyzeMealPhotoAndBuildDashboard(args: {
  date?: string;
  mealSlot: MealSlot;
  photo: { file_id: string; download_url: string };
}) {
  const nextDate = normalizeDate(args.date);
  const existing = await findExistingEntry(nextDate, args.photo.file_id);
  if (!existing) {
    const entry: FoodEntryInsert = {
      user_id: "00000000-0000-0000-0000-000000000000",
      status: "committed",
      meal: args.mealSlot,
      food_name: "Meal photo",
      display_name: "Meal photo",
      servings: 1,
      serving_label: "1 photo",
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      source_kind: "photo",
      source_ref: args.photo.file_id,
      provenance: "estimated",
      confidence: 0.2,
      occurred_at: new Date().toISOString(),
      local_date: nextDate,
      timezone: DEFAULT_TIMEZONE,
      notes: `Pending photo estimate. Source: ${args.photo.download_url}`,
    };

    await insertFoodEntry(entry);
  }

  return {
    payload: await buildDashboardPayload(nextDate),
    pending: true,
  };
}

export const openCalorieDashboard = {
  name: "open_calorie_dashboard",
  title: "Open calorie dashboard",
  description:
    "Use this when the user wants to open, view, or refresh the calorie dashboard widget in ChatGPT.",
  inputSchema: openDashboardInput.shape,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  async execute({ date }: { date?: string }) {
    const payload = await buildDashboardPayload(date);
    return {
      structuredContent: payload,
      content: [
        {
          type: "text" as const,
          text: `Opened the calorie dashboard for ${payload.dashboard.date}.`,
        },
      ],
    };
  },
};

export const loadDaySnapshot = {
  name: "load_day_snapshot",
  title: "Load day snapshot",
  description:
    "Use this when the app needs the dashboard state for a specific day without re-opening the widget.",
  inputSchema: loadDayInput.shape,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  async execute({ date }: { date: string }) {
    const payload = await buildDashboardPayload(date);
    return {
      structuredContent: payload,
      content: [
        {
          type: "text" as const,
          text: `Loaded the dashboard snapshot for ${payload.dashboard.date}.`,
        },
      ],
    };
  },
};

export const logMealFromText = {
  name: "log_meal_from_text",
  title: "Log meal from text",
  description:
    "Use this when the user types a meal in plain English and the dashboard should be updated immediately.",
  inputSchema: logMealInput.shape,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  async execute(args: { date?: string; mealSlot?: MealSlot; description: string; dedupeKey?: string }) {
    const result = await logTextMealAndBuildDashboard(args);
    return {
      structuredContent: result.payload,
      content: [
        {
          type: "text" as const,
          text: result.reused ? `Meal already logged: ${result.label}.` : `Logged ${result.label}.`,
        },
      ],
    };
  },
};

export const searchFoodCatalogTool = {
  name: "search_food_catalog",
  title: "Search food catalog",
  description:
    "Use this when the widget needs quick-add food results for the search box.",
  inputSchema: searchFoodInput.shape,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  async execute({ query, limit }: { query: string; limit?: number }) {
    const payload = await buildCatalogSearchPayload(query, limit);
    return {
      structuredContent: payload,
      content: [
        {
          type: "text" as const,
          text:
            payload.results.length > 0
              ? `Found ${payload.results.length} foods for "${query}".`
              : `No foods found for "${query}".`,
        },
      ],
    };
  },
};

export const logFoodSelection = {
  name: "log_food_selection",
  title: "Log selected food",
  description:
    "Use this when the user taps a search result in the widget and wants it added to the day.",
  inputSchema: logCatalogInput.shape,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  async execute(args: {
    date?: string;
    mealSlot: MealSlot;
    foodId: string;
    servings?: number;
    dedupeKey?: string;
  }) {
    const result = await logCatalogSelectionAndBuildDashboard(args);
    return {
      structuredContent: result.payload,
      content: [
        {
          type: "text" as const,
          text: result.reused ? `${result.label} was already added.` : `Added ${result.label}.`,
        },
      ],
    };
  },
};

export const updateGoalTargets = {
  name: "update_goal_targets",
  title: "Update goal targets",
  description:
    "Use this when the user edits calorie or macro targets from the widget and expects the dashboard to refresh.",
  inputSchema: setGoalsInput.shape,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  async execute(args: {
    date?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fiber?: number;
  }) {
    const result = await updateGoalTargetsAndBuildDashboard(args);
    return {
      structuredContent: result.payload,
      content: [
        {
          type: "text" as const,
          text: result.fiberSaved
            ? "Updated calorie and macro targets."
            : "Updated calorie and macro targets. Fiber remains on the default target in this build.",
        },
      ],
    };
  },
};

export const removeMealEntry = {
  name: "remove_meal_entry",
  title: "Remove meal entry",
  description:
    "Use this when the user deletes a meal entry from the dashboard.",
  inputSchema: removeEntryInput.shape,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  },
  async execute(args: { entryId: string; date?: string }) {
    const result = await removeMealEntryAndBuildDashboard(args);
    return {
      structuredContent: result.payload,
      content: [
        {
          type: "text" as const,
          text: result.removed ? "Removed the meal entry." : "The meal entry was not found.",
        },
      ],
    };
  },
};

export const analyzeMealPhoto = {
  name: "analyze_meal_photo",
  title: "Analyze meal photo",
  description:
    "Use this when the user uploads a meal photo from the widget. This build stores the photo as a pending meal entry and refreshes the dashboard.",
  inputSchema: analyzeMealPhotoInput,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  async execute(args: { date?: string; mealSlot: MealSlot; photo: { file_id: string; download_url: string } }) {
    const result = await analyzeMealPhotoAndBuildDashboard(args);
    return {
      structuredContent: result.payload,
      content: [
        {
          type: "text" as const,
          text: result.pending
            ? "Saved the meal photo as a pending entry."
            : "Analyzed the meal photo.",
        },
      ],
    };
  },
};
