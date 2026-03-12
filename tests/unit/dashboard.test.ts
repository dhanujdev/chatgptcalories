import { describe, expect, it } from "vitest";

import { buildDashboardSnapshot } from "../../server/src/dashboard.ts";
import type { MealEntry } from "../../shared/types.ts";

function mealEntry(overrides: Partial<MealEntry>): MealEntry {
  return {
    id: "entry-1",
    date: "2026-03-12",
    mealSlot: "breakfast",
    source: "manual",
    label: "Meal",
    servingText: "1 serving",
    notes: null,
    confidence: "high",
    createdAt: "2026-03-12T10:00:00.000Z",
    macros: {
      calories: 100,
      protein: 10,
      carbs: 5,
      fat: 4,
      fiber: 1,
    },
    ...overrides,
  };
}

describe("buildDashboardSnapshot", () => {
  it("builds grouped totals and remaining macros", () => {
    const db = {
      version: 1 as const,
      lastMutationId: 42,
      targets: {
        calories: 2200,
        protein: 180,
        carbs: 190,
        fat: 70,
        fiber: 30,
      },
      days: {
        "2026-03-12": {
          entries: [
            mealEntry({
              id: "e1",
              mealSlot: "breakfast",
              macros: { calories: 300, protein: 20, carbs: 25, fat: 10, fiber: 4 },
            }),
            mealEntry({
              id: "e2",
              mealSlot: "lunch",
              macros: { calories: 500, protein: 35, carbs: 45, fat: 15, fiber: 8 },
            }),
          ],
        },
      },
    };

    const snapshot = buildDashboardSnapshot(db, "2026-03-12");

    expect(snapshot.stateVersion).toBe(42);
    expect(snapshot.summary.totals.calories).toBe(800);
    expect(snapshot.summary.totals.protein).toBe(55);
    expect(snapshot.summary.remaining.calories).toBe(1400);
    expect(snapshot.summary.remaining.protein).toBe(125);
    expect(snapshot.mealGroups).toHaveLength(4);
    expect(snapshot.mealGroups.find((group) => group.mealSlot === "dinner")?.entries).toEqual([]);
  });
});
