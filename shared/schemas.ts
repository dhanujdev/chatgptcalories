import { z } from "zod";

export const mealSlotSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const macrosSchema = z.object({
  calories: z.number().min(0),
  protein: z.number().min(0),
  carbs: z.number().min(0),
  fat: z.number().min(0),
  fiber: z.number().min(0),
});

export const logTextMealInput = z.object({
  date: dateSchema,
  mealSlot: mealSlotSchema.optional(),
  description: z.string().min(1),
  dedupeKey: z.string().optional(),
});

export const analyzeMealInput = z.object({
  date: dateSchema,
  mealSlot: mealSlotSchema,
  label: z.string().min(1),
  items: z.array(
    z.object({
      food_name: z.string().min(1),
      grams: z.number().optional(),
      servings: z.number().min(0.25).max(10).default(1),
      calories: z.number().min(0),
      protein: z.number().min(0),
      carbs: z.number().min(0),
      fat: z.number().min(0),
      fiber: z.number().min(0).default(0),
    })
  ),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  notes: z.string().optional(),
});

export const searchFoodInput = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(10).optional(),
});

export const getDailySummaryInput = z.object({
  date: dateSchema,
});

export const getWeeklyTrendsInput = z.object({
  endDate: dateSchema,
});

export const setGoalsInput = z.object({
  calories: z.number().min(1200).max(5000).optional(),
  protein: z.number().min(50).max(300).optional(),
  carbs: z.number().min(50).max(400).optional(),
  fat: z.number().min(20).max(200).optional(),
  fiber: z.number().min(10).max(80).optional(),
});

export const updatePreferencesInput = z.object({
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
});

export const logWeightInput = z.object({
  date: dateSchema,
  weight_lbs: z.number().min(50).max(700),
});

export const retrieveAgentContextInput = z.object({
  date: dateSchema,
});

export const saveMemoryFactInput = z.object({
  fact_text: z.string().min(1),
  category: z.enum(["allergy", "preference", "goal", "habit", "health", "other"]),
  source: z.string().optional(),
});

export const getMemoryDashboardInput = z.object({});

export const logMealInput = z.object({
  date: dateSchema,
  mealSlot: mealSlotSchema.optional(),
  description: z.string().min(1),
  dedupeKey: z.string().optional(),
});

export const logCatalogInput = z.object({
  date: dateSchema,
  mealSlot: mealSlotSchema,
  foodId: z.string(),
  servings: z.number().min(0.5).max(4).optional(),
  dedupeKey: z.string().optional(),
});

export const removeEntryInput = z.object({
  entryId: z.string().min(1),
  date: dateSchema,
});

export const openDashboardInput = z.object({
  date: dateSchema,
});

export const loadDayInput = z.object({
  date: z.string(),
});
