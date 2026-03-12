import { supabase } from "./client.js";
import type {
    FoodEntryInsert,
    FoodEntryRow,
    MemoryFactRow,
    UserGoalsRow,
    UserPreferencesRow,
    WeightLogRow,
} from "./types.js";

/** Default user ID for single-user MCP mode. */
const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000";

function userId(uid?: string): string {
    return uid ?? DEFAULT_USER_ID;
}

function todayDate(): string {
    return new Date().toISOString().slice(0, 10);
}

function shiftDate(iso: string, offset: number): string {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
}

// ─── Food Entries ────────────────────────────────────────────────────

export async function insertFoodEntry(entry: FoodEntryInsert): Promise<FoodEntryRow> {
    const { data, error } = await supabase
        .from("food_entries")
        .insert(entry)
        .select()
        .single();

    if (error) throw new Error(`insertFoodEntry: ${error.message}`);
    return data as FoodEntryRow;
}

export async function getDayEntries(
    date: string,
    uid?: string
): Promise<FoodEntryRow[]> {
    const { data, error } = await supabase
        .from("food_entries")
        .select("*")
        .eq("user_id", userId(uid))
        .eq("local_date", date)
        .eq("status", "committed")
        .order("occurred_at", { ascending: true });

    if (error) throw new Error(`getDayEntries: ${error.message}`);
    return (data ?? []) as FoodEntryRow[];
}

export async function removeFoodEntry(entryId: string, uid?: string): Promise<boolean> {
    const { error, count } = await supabase
        .from("food_entries")
        .update({ status: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", entryId)
        .eq("user_id", userId(uid));

    if (error) throw new Error(`removeFoodEntry: ${error.message}`);
    return (count ?? 0) > 0;
}

export async function getWeekEntries(
    endDate: string,
    uid?: string
): Promise<FoodEntryRow[]> {
    const startDate = shiftDate(endDate, -6);
    const { data, error } = await supabase
        .from("food_entries")
        .select("*")
        .eq("user_id", userId(uid))
        .eq("status", "committed")
        .gte("local_date", startDate)
        .lte("local_date", endDate)
        .order("local_date", { ascending: true });

    if (error) throw new Error(`getWeekEntries: ${error.message}`);
    return (data ?? []) as FoodEntryRow[];
}

// ─── Goals ───────────────────────────────────────────────────────────

export async function getGoals(uid?: string): Promise<UserGoalsRow | null> {
    const { data, error } = await supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", userId(uid))
        .maybeSingle();

    if (error) throw new Error(`getGoals: ${error.message}`);
    return data as UserGoalsRow | null;
}

export async function upsertGoals(
    goals: Partial<Omit<UserGoalsRow, "user_id" | "updated_at">>,
    uid?: string
): Promise<UserGoalsRow> {
    const { data, error } = await supabase
        .from("user_goals")
        .upsert(
            { user_id: userId(uid), ...goals, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
        )
        .select()
        .single();

    if (error) throw new Error(`upsertGoals: ${error.message}`);
    return data as UserGoalsRow;
}

// ─── Preferences ─────────────────────────────────────────────────────

export async function getPreferences(uid?: string): Promise<UserPreferencesRow | null> {
    const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", userId(uid))
        .maybeSingle();

    if (error) throw new Error(`getPreferences: ${error.message}`);
    return data as UserPreferencesRow | null;
}

export async function upsertPreferences(
    prefs: Partial<Omit<UserPreferencesRow, "user_id" | "created_at" | "updated_at">>,
    uid?: string
): Promise<UserPreferencesRow> {
    const { data, error } = await supabase
        .from("user_preferences")
        .upsert(
            { user_id: userId(uid), ...prefs, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
        )
        .select()
        .single();

    if (error) throw new Error(`upsertPreferences: ${error.message}`);
    return data as UserPreferencesRow;
}

// ─── Memory Facts ────────────────────────────────────────────────────

export async function getMemoryFacts(uid?: string): Promise<MemoryFactRow[]> {
    const { data, error } = await supabase
        .from("memory_facts")
        .select("*")
        .eq("user_id", userId(uid))
        .eq("active", true)
        .order("created_at", { ascending: false });

    if (error) throw new Error(`getMemoryFacts: ${error.message}`);
    return (data ?? []) as MemoryFactRow[];
}

export async function insertMemoryFact(
    fact: { fact_text: string; category: MemoryFactRow["category"]; source?: string },
    uid?: string
): Promise<MemoryFactRow> {
    const { data, error } = await supabase
        .from("memory_facts")
        .insert({ user_id: userId(uid), ...fact })
        .select()
        .single();

    if (error) throw new Error(`insertMemoryFact: ${error.message}`);
    return data as MemoryFactRow;
}

export async function deactivateMemoryFact(factId: string, uid?: string): Promise<boolean> {
    const { error, count } = await supabase
        .from("memory_facts")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", factId)
        .eq("user_id", userId(uid));

    if (error) throw new Error(`deactivateMemoryFact: ${error.message}`);
    return (count ?? 0) > 0;
}

// ─── Weight ──────────────────────────────────────────────────────────

export async function insertWeightLog(
    weight: { date: string; weight_lbs: number },
    uid?: string
): Promise<WeightLogRow> {
    const { data, error } = await supabase
        .from("weight_logs")
        .insert({ user_id: userId(uid), ...weight })
        .select()
        .single();

    if (error) throw new Error(`insertWeightLog: ${error.message}`);
    return data as WeightLogRow;
}

export async function getRecentWeightLogs(
    limit = 7,
    uid?: string
): Promise<WeightLogRow[]> {
    const { data, error } = await supabase
        .from("weight_logs")
        .select("*")
        .eq("user_id", userId(uid))
        .order("date", { ascending: false })
        .limit(limit);

    if (error) throw new Error(`getRecentWeightLogs: ${error.message}`);
    return (data ?? []) as WeightLogRow[];
}
