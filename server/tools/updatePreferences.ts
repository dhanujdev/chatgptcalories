import { z } from "zod";
import { upsertPreferences } from "../supabase/queries.js";

export const updatePreferencesInput = {
  dietary_restrictions: z.array(z.string()).optional(),
  cuisine_preferences: z.array(z.string()).optional(),
  diet_type: z
    .enum([
      "standard",
      "keto",
      "paleo",
      "vegan",
      "vegetarian",
      "mediterranean",
      "high_protein",
      "low_carb",
    ])
    .optional(),
  meal_frequency: z.number().int().min(1).max(8).optional(),
  notes: z.string().optional(),
};

export const updatePreferences = {
  name: "update_preferences",
  title: "Update dietary preferences",
  description:
    "Save or update the user's dietary preferences. " +
    "Use this when the user mentions allergies, diet types, cuisine preferences, or meal frequency. " +
    "Examples: 'I'm vegetarian', 'I hate cilantro', 'I eat 4 meals a day'.",
  inputSchema: updatePreferencesInput,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },

  async execute(input: {
    dietary_restrictions?: string[];
    cuisine_preferences?: string[];
    diet_type?: string;
    meal_frequency?: number;
    notes?: string;
  }) {
    const saved = await upsertPreferences(input);

    const parts: string[] = [];
    if (saved.diet_type) parts.push(`Diet: ${saved.diet_type}`);
    if (saved.dietary_restrictions.length > 0)
      parts.push(`Restrictions: ${saved.dietary_restrictions.join(", ")}`);
    if (saved.cuisine_preferences.length > 0)
      parts.push(`Cuisines: ${saved.cuisine_preferences.join(", ")}`);
    parts.push(`Meals/day: ${saved.meal_frequency}`);

    return {
      content: [
        {
          type: "text" as const,
          text: `Preferences saved. ${parts.join(". ")}.`,
        },
      ],
    };
  },
};
