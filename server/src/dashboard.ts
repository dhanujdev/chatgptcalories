import type {
  DashboardSnapshot,
  GoalTargets,
  MacroTotals,
  MealEntry,
  MealGroup,
  MealSlot,
  WeeklyTrendPoint,
} from "../../shared/types.js";

type JournalDb = {
  version: 1;
  lastMutationId: number;
  targets: GoalTargets;
  days: Record<string, { entries: MealEntry[] }>;
};

const mealLabels: Record<MealSlot, string> = {
  breakfast: "Sunrise",
  lunch: "Midday",
  dinner: "Evening",
  snack: "Flex snack",
};

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function zeroMacros(): MacroTotals {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
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

function subtractMacros(targets: GoalTargets, totals: MacroTotals): MacroTotals {
  return {
    calories: round(targets.calories - totals.calories),
    protein: round(targets.protein - totals.protein),
    carbs: round(targets.carbs - totals.carbs),
    fat: round(targets.fat - totals.fat),
    fiber: round((targets.fiber ?? 0) - totals.fiber),
  };
}

function shiftDate(isoDate: string, offset: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function sumEntries(entries: MealEntry[]): MacroTotals {
  return entries.reduce((sum, entry) => addMacros(sum, entry.macros), zeroMacros());
}

function buildMealGroups(entries: MealEntry[]): MealGroup[] {
  const order: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
  return order.map((mealSlot) => {
    const groupEntries = entries.filter((entry) => entry.mealSlot === mealSlot);
    return {
      mealSlot,
      label: mealLabels[mealSlot],
      totals: sumEntries(groupEntries),
      entries: groupEntries,
    };
  });
}

function computeStreak(db: JournalDb, date: string): number {
  let cursor = date;
  let streak = 0;
  while ((db.days[cursor]?.entries.length ?? 0) > 0) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

function coachNote(targets: GoalTargets, totals: MacroTotals, remaining: MacroTotals): string {
  if (remaining.calories < 0) {
    return `You are ${Math.abs(Math.round(remaining.calories))} kcal over target. Make the next meal light and protein-heavy.`;
  }

  if (remaining.protein > 35) {
    return `You still have ${Math.round(remaining.protein)}g of protein runway. A shake or lean bowl closes the gap fast.`;
  }

  if (totals.calories < targets.calories * 0.45) {
    return "You are still early in the day. A bigger, fiber-heavy lunch would keep the evening calmer.";
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
  const notes: string[] = [];

  if (remaining.protein > 30) {
    notes.push("Add a 25-30g protein anchor before the day closes.");
  }

  if (remaining.calories > 200 && remaining.calories < 450) {
    notes.push("You have room for one compact meal or a measured snack.");
  }

  if (remaining.calories < 0) {
    notes.push("Skip liquid calories and keep the next plate mostly lean protein + produce.");
  }

  if (remaining.fiber > 8) {
    notes.push("Fiber is under target. Fruit or oats will correct it quickly.");
  }

  return notes.length > 0 ? notes : ["Momentum looks good. Repeat the same structure tomorrow."];
}

function weeklyTrend(db: JournalDb, date: string, targetCalories: number): WeeklyTrendPoint[] {
  const points: WeeklyTrendPoint[] = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const pointDate = shiftDate(date, offset);
    const entries = db.days[pointDate]?.entries ?? [];
    const totals = sumEntries(entries);
    points.push({
      date: pointDate,
      calories: totals.calories,
      target: targetCalories,
      protein: totals.protein,
    });
  }
  return points;
}

export function buildDashboardSnapshot(db: JournalDb, date: string): DashboardSnapshot {
  const entries = db.days[date]?.entries ?? [];
  const groups = buildMealGroups(entries);
  const totals = groups.reduce((sum, group) => addMacros(sum, group.totals), zeroMacros());
  const remaining = subtractMacros(db.targets, totals);

  const calorieAccuracy = Math.max(
    0,
    100 - Math.min(100, Math.abs(remaining.calories) / Math.max(db.targets.calories, 1) * 120)
  );
  const proteinAccuracy = Math.min(
    100,
    totals.protein / Math.max(db.targets.protein, 1) * 100
  );
  const adherenceScore = Math.round((calorieAccuracy * 0.6 + proteinAccuracy * 0.4));

  return {
    stateVersion: db.lastMutationId,
    date,
    summary: {
      date,
      targets: db.targets,
      totals,
      remaining,
      adherenceScore,
      proteinRunway: round(Math.max(remaining.protein, 0)),
      calorieDelta: round(totals.calories - db.targets.calories),
      streak: computeStreak(db, date),
      momentumLabel: momentumLabel(adherenceScore),
      coachNote: coachNote(db.targets, totals, remaining),
    },
    mealGroups: groups,
    suggestions: suggestions(remaining),
    weeklyTrend: weeklyTrend(db, date, db.targets.calories),
  };
}

