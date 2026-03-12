import { z } from "zod";
import { insertFoodEntry } from "../supabase/queries.js";
import { DEFAULT_TIMEZONE } from "../../shared/constants.js";
import type { FoodEntryInsert } from "../supabase/types.js";

export const analyzeMealInput = {
    date: z.string().optional(),
    mealSlot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    label: z.string().min(1),
    items: z.array(z.object({
        food_name: z.string().min(1),
        servings: z.number().min(0.25).max(10).default(1),
        calories: z.number().min(0),
        protein: z.number().min(0),
        carbs: z.number().min(0),
        fat: z.number().min(0),
        fiber: z.number().min(0).default(0),
    })),
    confidence: z.enum(["high", "medium", "low"]).optional(),
    notes: z.string().optional(),
};

function todayDate(): string {
    return new Date().toISOString().slice(0, 10);
}

export const analyzeMeal = {
    name: "analyze_meal",
    title: "Analyze and log a meal",
    description:
        "Use this when ChatGPT has already analyzed a photo or a complex meal description " +
        "and has structured nutrition data to log. ChatGPT provides the breakdown, " +
        "this tool saves it to the database. Pass each food item with its macros.",
    inputSchema: analyzeMealInput,
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
    },

    async execute({ date, mealSlot, label, items, confidence, notes }: {
        date?: string;
        mealSlot: "breakfast" | "lunch" | "dinner" | "snack";
        label: string;
        items: Array<{
            food_name: string;
            servings: number;
            calories: number;
            protein: number;
            carbs: number;
            fat: number;
            fiber: number;
        }>;
        confidence?: "high" | "medium" | "low";
        notes?: string;
    }) {
        const nextDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayDate();
        const confBand = confidence ?? "medium";

        const totalCals = items.reduce((s, i) => s + i.calories * i.servings, 0);
        const totalProtein = items.reduce((s, i) => s + i.protein * i.servings, 0);
        const totalCarbs = items.reduce((s, i) => s + i.carbs * i.servings, 0);
        const totalFat = items.reduce((s, i) => s + i.fat * i.servings, 0);
        const totalFiber = items.reduce((s, i) => s + i.fiber * i.servings, 0);

        const entry: FoodEntryInsert = {
            user_id: "00000000-0000-0000-0000-000000000000",
            status: "committed",
            meal: mealSlot,
            food_name: label,
            display_name: label,
            servings: 1,
            serving_label: `${items.length} items`,
            calories: Math.round(totalCals),
            protein_g: Math.round(totalProtein * 10) / 10,
            carbs_g: Math.round(totalCarbs * 10) / 10,
            fat_g: Math.round(totalFat * 10) / 10,
            fiber_g: Math.round(totalFiber * 10) / 10,
            source_kind: "photo",
            source_ref: null,
            provenance: "estimated",
            confidence: confBand === "high" ? 0.9 : confBand === "medium" ? 0.7 : 0.4,
            occurred_at: new Date().toISOString(),
            local_date: nextDate,
            timezone: DEFAULT_TIMEZONE,
            notes: notes ?? items.map(i => `${i.servings}x ${i.food_name}`).join(", "),
        };

        await insertFoodEntry(entry);

        return {
            content: [{ type: "text" as const, text: `Logged "${label}" for ${mealSlot} on ${nextDate}. Total: ${Math.round(totalCals)} kcal, ${Math.round(totalProtein)}g protein.` }],
        };
    },
};
