import { z } from "zod";
import { estimateMealFromText, findCatalogItem } from "../src/catalog.js";
import { insertFoodEntry, getDayEntries } from "../supabase/queries.js";
import { DEFAULT_TIMEZONE } from "../../shared/constants.js";
import type { FoodEntryInsert } from "../supabase/types.js";

export const logTextMealInput = {
    date: z.string().optional(),
    mealSlot: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
    description: z.string().min(1),
    dedupeKey: z.string().optional(),
};

function todayDate(): string {
    return new Date().toISOString().slice(0, 10);
}

export const logTextMeal = {
    name: "log_text_meal",
    title: "Log meal from text",
    description:
        "Use this when the user describes a meal or snack in plain language. " +
        "Parse what you can and pass the description here. " +
        "Returns an updated daily summary with the new entry.",
    inputSchema: logTextMealInput,
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
    },

    async execute({ date, mealSlot, description, dedupeKey }: {
        date?: string;
        mealSlot?: "breakfast" | "lunch" | "dinner" | "snack";
        description: string;
        dedupeKey?: string;
    }) {
        const nextDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayDate();
        const nextMealSlot = mealSlot ?? "lunch";
        const estimate = estimateMealFromText(description, nextMealSlot);

        const entry: FoodEntryInsert = {
            user_id: "00000000-0000-0000-0000-000000000000",
            status: "committed",
            meal: nextMealSlot,
            food_name: description,
            display_name: estimate.label,
            servings: 1,
            serving_label: estimate.servingText,
            calories: estimate.macros.calories,
            protein_g: estimate.macros.protein,
            carbs_g: estimate.macros.carbs,
            fat_g: estimate.macros.fat,
            fiber_g: estimate.macros.fiber,
            source_kind: "manual",
            source_ref: dedupeKey ?? null,
            provenance: estimate.confidence === "high" ? "catalog_resolved" : "estimated",
            confidence: estimate.confidence === "high" ? 0.9 : estimate.confidence === "medium" ? 0.7 : 0.4,
            occurred_at: new Date().toISOString(),
            local_date: nextDate,
            timezone: DEFAULT_TIMEZONE,
            notes: estimate.notes,
        };

        const saved = await insertFoodEntry(entry);

        return {
            content: [{ type: "text" as const, text: `Logged ${estimate.label} for ${nextMealSlot} on ${nextDate}. ${estimate.macros.calories} kcal, ${estimate.macros.protein}g protein.` }],
        };
    },
};
