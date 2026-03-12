import { z } from "zod";
import { upsertGoals, getGoals } from "../supabase/queries.js";

export const setGoalsInput = {
    calories: z.number().min(1200).max(5000).optional(),
    protein: z.number().min(50).max(300).optional(),
    carbs: z.number().min(50).max(400).optional(),
    fat: z.number().min(20).max(200).optional(),
};

export const setGoals = {
    name: "set_goals",
    title: "Set nutrition goals",
    description:
        "Update the user's daily calorie and macro targets. " +
        "Use this when the user says 'I want to eat 2000 calories' or 'set my protein to 150g'. " +
        "Only pass the values being changed — others stay the same.",
    inputSchema: setGoalsInput,
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
    },

    async execute({ calories, protein, carbs, fat }: {
        calories?: number;
        protein?: number;
        carbs?: number;
        fat?: number;
    }) {
        const update: Record<string, number> = {};
        if (calories !== undefined) update.daily_calories = calories;
        if (protein !== undefined) update.protein_grams = protein;
        if (carbs !== undefined) update.carbs_grams = carbs;
        if (fat !== undefined) update.fat_grams = fat;

        const saved = await upsertGoals(update);

        return {
            content: [{
                type: "text" as const,
                text: `Goals updated: ${saved.daily_calories} kcal, ${saved.protein_grams}g protein, ${saved.carbs_grams}g carbs, ${saved.fat_grams}g fat.`,
            }],
        };
    },
};
