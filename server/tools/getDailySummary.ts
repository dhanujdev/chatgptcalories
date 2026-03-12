import { z } from "zod";
import { getDayEntries, getGoals } from "../supabase/queries.js";
import { DEFAULT_GOALS, ZERO_MACROS } from "../../shared/constants.js";
import type { MacroTotals } from "../../shared/types.js";

function todayDate(): string {
    return new Date().toISOString().slice(0, 10);
}

function round(v: number): number {
    return Math.round(v * 10) / 10;
}

function sumEntryMacros(entries: Array<{ calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }>): MacroTotals {
    return entries.reduce(
        (sum, e) => ({
            calories: sum.calories + e.calories,
            protein: sum.protein + e.protein_g,
            carbs: sum.carbs + e.carbs_g,
            fat: sum.fat + e.fat_g,
            fiber: sum.fiber + e.fiber_g,
        }),
        { ...ZERO_MACROS }
    );
}

export const getDailySummaryInput = {
    date: z.string().optional(),
};

export const getDailySummary = {
    name: "get_daily_summary",
    title: "Get daily summary",
    description:
        "Returns the user's calorie and macro totals for a given day, including remaining budget, " +
        "adherence score, and a coaching note. Use this to answer questions about today's nutrition status.",
    inputSchema: getDailySummaryInput,
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
    },

    async execute({ date }: { date?: string }) {
        const nextDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayDate();
        const entries = await getDayEntries(nextDate);
        const goalsRow = await getGoals();

        const targets = {
            calories: goalsRow?.daily_calories ?? DEFAULT_GOALS.calories,
            protein: goalsRow?.protein_grams ?? DEFAULT_GOALS.protein,
            carbs: goalsRow?.carbs_grams ?? DEFAULT_GOALS.carbs,
            fat: goalsRow?.fat_grams ?? DEFAULT_GOALS.fat,
            fiber: DEFAULT_GOALS.fiber ?? 30,
        };

        const totals = sumEntryMacros(entries);
        const remaining: MacroTotals = {
            calories: round(targets.calories - totals.calories),
            protein: round(targets.protein - totals.protein),
            carbs: round(targets.carbs - totals.carbs),
            fat: round(targets.fat - totals.fat),
            fiber: round(targets.fiber - totals.fiber),
        };

        const adherence = Math.round(
            Math.max(0, 100 - Math.abs(remaining.calories) / Math.max(targets.calories, 1) * 120) * 0.6 +
            Math.min(100, totals.protein / Math.max(targets.protein, 1) * 100) * 0.4
        );

        let coachNote = "The day is balanced. Hold steady.";
        if (remaining.calories < 0) {
            coachNote = `You are ${Math.abs(Math.round(remaining.calories))} kcal over target. Make the next meal light and protein-heavy.`;
        } else if (remaining.protein > 35) {
            coachNote = `You still have ${Math.round(remaining.protein)}g of protein runway. A shake or lean bowl closes the gap.`;
        } else if (totals.calories < targets.calories * 0.45) {
            coachNote = "Still early in the day. A bigger, fiber-heavy lunch would keep the evening calmer.";
        }

        const mealList = entries.map(e =>
            `• ${e.display_name ?? e.food_name} (${e.meal}) — ${e.calories} kcal, ${e.protein_g}g protein`
        ).join("\n");

        const summary =
            `📊 Daily Summary for ${nextDate}\n` +
            `Consumed: ${Math.round(totals.calories)} / ${targets.calories} kcal\n` +
            `Protein: ${round(totals.protein)} / ${targets.protein}g\n` +
            `Carbs: ${round(totals.carbs)} / ${targets.carbs}g\n` +
            `Fat: ${round(totals.fat)} / ${targets.fat}g\n` +
            `Fiber: ${round(totals.fiber)} / ${targets.fiber}g\n` +
            `Remaining: ${Math.round(remaining.calories)} kcal\n` +
            `Adherence: ${adherence}/100\n\n` +
            `Coach: ${coachNote}\n\n` +
            `Meals logged (${entries.length}):\n${mealList || "No meals logged yet."}`;

        return {
            content: [{ type: "text" as const, text: summary }],
        };
    },
};
