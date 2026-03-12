import { z } from "zod";
import {
    getDayEntries,
    getGoals,
    getPreferences,
    getMemoryFacts,
} from "../supabase/queries.js";
import { DEFAULT_GOALS, ZERO_MACROS } from "../../shared/constants.js";
import { coachSystemPrompt } from "../prompts/coachPrompt.js";

function todayDate(): string {
    return new Date().toISOString().slice(0, 10);
}

function round(v: number): number {
    return Math.round(v * 10) / 10;
}

export const retrieveAgentContextInput = {
    date: z.string().optional(),
};

export const retrieveAgentContext = {
    name: "retrieve_agent_context",
    title: "Retrieve agent context",
    description:
        "Load the full agent context for the current conversation turn. " +
        "This returns the user's goals, dietary preferences, today's nutrition summary, " +
        "recent meals, and all stored memory facts. " +
        "Use this at the start of each conversation or when you need a full refresh of the user's state. " +
        "This is what makes you a personal nutrition coach instead of a generic assistant.",
    inputSchema: retrieveAgentContextInput,
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
    },

    async execute({ date }: { date?: string }) {
        const nextDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayDate();

        const [entries, goalsRow, prefsRow, facts] = await Promise.all([
            getDayEntries(nextDate),
            getGoals(),
            getPreferences(),
            getMemoryFacts(),
        ]);

        // Compute today's totals
        const totals = entries.reduce(
            (sum, e) => ({
                calories: sum.calories + e.calories,
                protein: sum.protein + e.protein_g,
                carbs: sum.carbs + e.carbs_g,
                fat: sum.fat + e.fat_g,
                fiber: sum.fiber + e.fiber_g,
            }),
            { ...ZERO_MACROS }
        );

        const targets = {
            calories: goalsRow?.daily_calories ?? DEFAULT_GOALS.calories,
            protein: goalsRow?.protein_grams ?? DEFAULT_GOALS.protein,
            carbs: goalsRow?.carbs_grams ?? DEFAULT_GOALS.carbs,
            fat: goalsRow?.fat_grams ?? DEFAULT_GOALS.fat,
            fiber: DEFAULT_GOALS.fiber ?? 30,
        };

        const remaining = {
            calories: round(targets.calories - totals.calories),
            protein: round(targets.protein - totals.protein),
            carbs: round(targets.carbs - totals.carbs),
            fat: round(targets.fat - totals.fat),
            fiber: round(targets.fiber - totals.fiber),
        };

        // Format sections
        const goalsText = `🎯 Goals: ${targets.calories} kcal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat`;

        const prefsText = prefsRow
            ? `🍽️ Preferences: ${prefsRow.diet_type ?? "standard"} diet` +
            (prefsRow.dietary_restrictions.length > 0 ? `, restrictions: ${prefsRow.dietary_restrictions.join(", ")}` : "") +
            (prefsRow.cuisine_preferences.length > 0 ? `, cuisines: ${prefsRow.cuisine_preferences.join(", ")}` : "") +
            (prefsRow.notes ? `, notes: ${prefsRow.notes}` : "")
            : "🍽️ Preferences: not set yet";

        const summaryText =
            `📊 Today (${nextDate}): ${Math.round(totals.calories)} of ${targets.calories} kcal consumed\n` +
            `   Protein: ${round(totals.protein)} / ${targets.protein}g\n` +
            `   Remaining: ${Math.round(remaining.calories)} kcal, ${round(remaining.protein)}g protein`;

        const mealsText = entries.length > 0
            ? `🥗 Today's meals (${entries.length}):\n` +
            entries.map(e => `   • ${e.display_name ?? e.food_name} (${e.meal}) — ${e.calories} kcal`).join("\n")
            : "🥗 No meals logged today yet.";

        const factsText = facts.length > 0
            ? `🧠 Memory (${facts.length} facts):\n` +
            facts.map(f => `   • [${f.category}] ${f.fact_text}`).join("\n")
            : "🧠 No memory facts stored yet.";

        const contextBlock =
            `${coachSystemPrompt()}\n\n` +
            `--- AGENT CONTEXT ---\n` +
            `${goalsText}\n${prefsText}\n\n` +
            `${summaryText}\n\n` +
            `${mealsText}\n\n` +
            `${factsText}`;

        return {
            content: [{ type: "text" as const, text: contextBlock }],
        };
    },
};
