/** Row types matching the Supabase schema. */

export type FoodEntryRow = {
    id: string;
    user_id: string;
    status: "committed" | "deleted";
    meal: "breakfast" | "lunch" | "dinner" | "snack";
    food_name: string;
    display_name: string | null;
    servings: number;
    serving_label: string | null;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sodium_mg: number | null;
    source_kind: "manual" | "search" | "barcode" | "photo" | "voice" | "shortcut" | "memory" | "recipe" | "saved_meal";
    source_ref: string | null;
    provenance: "exact" | "estimated" | "user_entered" | "memory_resolved" | "catalog_resolved";
    confidence: number | null;
    occurred_at: string;
    local_date: string;
    timezone: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
};

export type FoodEntryInsert = Omit<FoodEntryRow, "id" | "created_at" | "updated_at" | "deleted_at" | "sodium_mg"> & {
    sodium_mg?: number | null;
};

export type UserGoalsRow = {
    user_id: string;
    daily_calories: number;
    protein_grams: number;
    carbs_grams: number;
    fat_grams: number;
    water_glasses: number;
    weight_goal_lbs: number | null;
    updated_at: string;
};

export type UserPreferencesRow = {
    user_id: string;
    dietary_restrictions: string[];
    cuisine_preferences: string[];
    diet_type: string | null;
    meal_frequency: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
};

export type MemoryFactRow = {
    id: string;
    user_id: string;
    fact_text: string;
    category: "allergy" | "preference" | "goal" | "habit" | "health" | "other";
    source: string;
    active: boolean;
    created_at: string;
    updated_at: string;
};

export type WeightLogRow = {
    id: string;
    user_id: string;
    date: string;
    weight_lbs: number;
    created_at: string;
};
