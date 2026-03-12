import type { GoalTargets, MacroTotals, MealSlot } from "./types.js";

export const DEFAULT_GOALS: GoalTargets = {
    calories: 2200,
    protein: 180,
    carbs: 190,
    fat: 70,
    fiber: 30,
};

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
    breakfast: "Sunrise",
    lunch: "Midday",
    dinner: "Evening",
    snack: "Flex snack",
};

export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export const MACRO_LABELS: Record<keyof MacroTotals, string> = {
    calories: "Calories",
    protein: "Protein",
    carbs: "Carbs",
    fat: "Fat",
    fiber: "Fiber",
};

export const ZERO_MACROS: MacroTotals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
};

export const DEFAULT_TIMEZONE = "America/New_York";
