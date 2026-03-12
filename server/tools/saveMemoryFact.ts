import { z } from "zod";
import { insertMemoryFact } from "../supabase/queries.js";

export const saveMemoryFactInput = {
    fact_text: z.string().min(1),
    category: z.enum(["allergy", "preference", "goal", "habit", "health", "other"]),
    source: z.string().optional(),
};

export const saveMemoryFact = {
    name: "save_memory_fact",
    title: "Save a memory fact",
    description:
        "Store a durable fact about the user that should be remembered across conversations. " +
        "Use this when the user mentions allergies, dietary restrictions, personal goals, eating habits, or health conditions. " +
        "Examples: 'I'm allergic to shellfish', 'I hate mushrooms', 'I'm training for a marathon', 'I have type 2 diabetes'. " +
        "Do NOT save transient information like 'I had pizza today'.",
    inputSchema: saveMemoryFactInput,
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
    },

    async execute({ fact_text, category, source }: {
        fact_text: string;
        category: "allergy" | "preference" | "goal" | "habit" | "health" | "other";
        source?: string;
    }) {
        const saved = await insertMemoryFact({
            fact_text,
            category,
            source: source ?? "conversation",
        });

        return {
            content: [{
                type: "text" as const,
                text: `Remembered: "${fact_text}" [${category}]. I'll use this to personalize your coaching.`,
            }],
        };
    },
};
