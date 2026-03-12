export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export type EntrySource = "text" | "catalog" | "manual" | "search" | "barcode" | "photo" | "voice" | "shortcut" | "memory" | "recipe" | "saved_meal";
export type Provenance = "exact" | "estimated" | "user_entered" | "memory_resolved" | "catalog_resolved";
export type ConfidenceBand = "high" | "medium" | "low";
export type DietType = "standard" | "keto" | "paleo" | "vegan" | "vegetarian" | "mediterranean" | "high_protein" | "low_carb";
export type MemoryCategory = "allergy" | "preference" | "goal" | "habit" | "health" | "other";

export type MacroTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export type GoalTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
};

export type MealEntry = {
  id: string;
  date: string;
  mealSlot: MealSlot;
  source: EntrySource;
  label: string;
  servingText: string;
  notes: string | null;
  confidence: ConfidenceBand;
  createdAt: string;
  macros: MacroTotals;
  photoStatus?: "pending" | "analyzed";
  photoFileId?: string | null;
};

export type MealGroup = {
  mealSlot: MealSlot;
  label: string;
  totals: MacroTotals;
  entries: MealEntry[];
};

export type WeeklyTrendPoint = {
  date: string;
  calories: number;
  target: number;
  protein: number;
};

export type DaySummary = {
  date: string;
  targets: GoalTargets;
  totals: MacroTotals;
  remaining: MacroTotals;
  adherenceScore: number;
  proteinRunway: number;
  calorieDelta: number;
  streak: number;
  momentumLabel: string;
  coachNote: string;
};

export type DashboardSnapshot = {
  stateVersion: number;
  date: string;
  summary: DaySummary;
  mealGroups: MealGroup[];
  suggestions: string[];
  weeklyTrend: WeeklyTrendPoint[];
};

export type CatalogResult = {
  id: string;
  name: string;
  brand: string | null;
  servingText: string;
  tags: string[];
  macros: MacroTotals;
};

export type DashboardPayload = {
  kind: "dashboard";
  dashboard: DashboardSnapshot;
};

export type CatalogSearchPayload = {
  kind: "catalogSearch";
  query: string;
  results: CatalogResult[];
};

export type ToolPayload = DashboardPayload | CatalogSearchPayload;

// ─── New agent types ─────────────────────────────────────────────────

export type UserPreferences = {
  dietaryRestrictions: string[];
  cuisinePreferences: string[];
  dietType: DietType | null;
  mealFrequency: number;
  notes: string | null;
};

export type MemoryFact = {
  id: string;
  factText: string;
  category: MemoryCategory;
  source: string;
  active: boolean;
  createdAt: string;
};

export type WeightEntry = {
  id: string;
  date: string;
  weightLbs: number;
  createdAt: string;
};

export type AgentContext = {
  goals: GoalTargets | null;
  preferences: UserPreferences | null;
  dailySummary: DaySummary | null;
  recentMeals: MealEntry[];
  memoryFacts: MemoryFact[];
};
