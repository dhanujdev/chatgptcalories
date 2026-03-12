import type { MacroTotals, MealSlot } from "../../shared/types.js";
import { estimateMealFromText, type EstimatedMeal } from "./catalog.js";

type ResolvedSource = "usda_api" | "edamam_api" | "catalog" | "unclassified";

export type ResolvedMeal = EstimatedMeal & {
  source: ResolvedSource;
};

type UsdaSearchResponse = {
  foods?: Array<{
    description?: string;
    dataType?: string;
    servingSize?: number;
    servingSizeUnit?: string;
    foodNutrients?: Array<{
      nutrientId?: number;
      nutrientName?: string;
      value?: number;
    }>;
  }>;
};

type EdamamNutritionResponse = {
  calories?: number;
  totalNutrients?: Record<string, { quantity?: number }>;
};

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampServings(value: number): number {
  return Math.max(0.5, Math.min(round(value), 12));
}

function addMacros(left: MacroTotals, right: MacroTotals): MacroTotals {
  return {
    calories: round(left.calories + right.calories),
    protein: round(left.protein + right.protein),
    carbs: round(left.carbs + right.carbs),
    fat: round(left.fat + right.fat),
    fiber: round(left.fiber + right.fiber),
  };
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((chunk) => (chunk ? chunk[0]!.toUpperCase() + chunk.slice(1).toLowerCase() : chunk))
    .join(" ");
}

function numberFromToken(token: string | undefined): number | null {
  if (!token) {
    return null;
  }

  const cleaned = token.trim();
  if (!cleaned) {
    return null;
  }

  if (/^\d+\/\d+$/.test(cleaned)) {
    const [numerator = 0, denominator = 0] = cleaned.split("/").map(Number);
    if (!denominator) {
      return null;
    }
    return numerator / denominator;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLeadingQuantity(text: string): number | null {
  const compact = text.trim();
  const mixed = compact.match(/^(\d+(?:\.\d+)?)\s+(\d+\/\d+)/);
  if (mixed?.[1] && mixed[2]) {
    const whole = numberFromToken(mixed[1]) ?? 0;
    const fraction = numberFromToken(mixed[2]) ?? 0;
    return whole + fraction;
  }

  const token = compact.match(/^(\d+(?:\.\d+)?|\d+\/\d+)/)?.[1];
  return numberFromToken(token);
}

function cleanDescription(description: string): string {
  return description
    .trim()
    .replace(/[.!?]+/g, " ")
    .replace(/^(?:i\s+(?:had|ate|logged|drank)\s+)/i, "")
    .replace(/\bfor\s+(?:breakfast|lunch|dinner|snack)\b/gi, "")
    .replace(/\b(?:breakfast|lunch|dinner|snack)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitIngredients(description: string): string[] {
  const cleaned = cleanDescription(description);
  if (!cleaned) {
    return [];
  }

  const parts = cleaned
    .split(/\s*(?:,|\band\b|\+)\s*/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [cleaned];
}

function queryNameFromIngredient(ingredient: string): string {
  return ingredient
    .replace(/^(\d+(?:\.\d+)?|\d+\/\d+)\s+/, "")
    .replace(
      /^(?:cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|oz|ounce|ounces|g|gram|grams|kg|ml|l|lb|lbs|pound|pounds|slice|slices|piece|pieces)\s+/i,
      ""
    )
    .trim();
}

function guessedGramsPerServing(name: string): number {
  const normalized = name.toLowerCase();
  if (normalized.includes("egg")) {
    return 50;
  }
  if (normalized.includes("apple")) {
    return 182;
  }
  if (normalized.includes("banana")) {
    return 118;
  }
  if (normalized.includes("yogurt")) {
    return 245;
  }
  if (normalized.includes("toast") || normalized.includes("bread")) {
    return 32;
  }
  if (normalized.includes("rice")) {
    return 158;
  }
  return 100;
}

function nutrientValue(
  nutrients: Array<{ nutrientId?: number; nutrientName?: string; value?: number }> | undefined,
  nutrientIds: number[],
  fallbackNames: string[]
): number {
  if (!nutrients || nutrients.length === 0) {
    return 0;
  }

  for (const nutrient of nutrients) {
    if (nutrient.nutrientId && nutrientIds.includes(nutrient.nutrientId)) {
      return Number.isFinite(nutrient.value) ? Number(nutrient.value) : 0;
    }
  }

  for (const nutrient of nutrients) {
    const name = nutrient.nutrientName?.toLowerCase() ?? "";
    if (fallbackNames.some((candidate) => name.includes(candidate))) {
      return Number.isFinite(nutrient.value) ? Number(nutrient.value) : 0;
    }
  }

  return 0;
}

function confidenceForResolution(unresolvedCount: number): ResolvedMeal["confidence"] {
  if (unresolvedCount <= 0) {
    return "high";
  }
  return "medium";
}

async function estimateFromUsda(description: string): Promise<ResolvedMeal | null> {
  const apiKey = process.env.USDA_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const ingredients = splitIngredients(description);
  if (ingredients.length === 0) {
    return null;
  }

  const total = ingredients.length;
  const resolved: Array<{ ingredient: string; quantity: number; macros: MacroTotals }> = [];

  for (const ingredient of ingredients) {
    const query = queryNameFromIngredient(ingredient);
    if (!query) {
      continue;
    }

    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}&pageSize=1`,
      { signal: AbortSignal.timeout(6000) }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return null;
      }
      continue;
    }

    const payload = (await response.json()) as UsdaSearchResponse;
    const food = payload.foods?.[0];
    const nutrients = food?.foodNutrients;
    if (!food || !nutrients || nutrients.length === 0) {
      continue;
    }

    const caloriesPer100g = nutrientValue(nutrients, [1008], ["energy"]);
    const proteinPer100g = nutrientValue(nutrients, [1003], ["protein"]);
    const carbsPer100g = nutrientValue(nutrients, [1005], ["carbohydrate"]);
    const fatPer100g = nutrientValue(nutrients, [1004], ["total lipid", "fat"]);
    const fiberPer100g = nutrientValue(nutrients, [1079], ["fiber"]);

    if (caloriesPer100g <= 0) {
      continue;
    }

    const quantity = clampServings(parseLeadingQuantity(ingredient) ?? 1);
    const servingSize = Number(food.servingSize);
    const unit = food.servingSizeUnit?.toLowerCase() ?? "";
    const gramsPerServing =
      Number.isFinite(servingSize) && servingSize > 0 && (unit === "g" || unit === "ml")
        ? servingSize
        : guessedGramsPerServing(query);
    const factor = (quantity * gramsPerServing) / 100;
    const macros: MacroTotals = {
      calories: round(caloriesPer100g * factor),
      protein: round(proteinPer100g * factor),
      carbs: round(carbsPer100g * factor),
      fat: round(fatPer100g * factor),
      fiber: round(fiberPer100g * factor),
    };

    resolved.push({ ingredient, quantity, macros });
  }

  if (resolved.length === 0) {
    return null;
  }

  const combined = resolved.reduce(
    (sum, item) => addMacros(sum, item.macros),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
  const unresolvedCount = total - resolved.length;
  const confidence = confidenceForResolution(unresolvedCount);

  if (resolved.length === 1) {
    const [single] = resolved;
    if (!single) {
      return null;
    }
    return {
      label: titleCase(queryNameFromIngredient(single.ingredient) || single.ingredient),
      servingText: single.ingredient,
      servings: single.quantity,
      notes:
        unresolvedCount > 0
          ? `${unresolvedCount} item${unresolvedCount === 1 ? "" : "s"} could not be resolved from USDA and were skipped.`
          : null,
      macros: combined,
      confidence,
      matched: true,
      source: "usda_api",
    };
  }

  return {
    label: resolved.map((item) => titleCase(queryNameFromIngredient(item.ingredient))).join(" + "),
    servingText: `${resolved.length} items`,
    servings: 1,
    notes:
      unresolvedCount > 0
        ? `${unresolvedCount} item${unresolvedCount === 1 ? "" : "s"} could not be resolved from USDA and were skipped.`
        : resolved.map((item) => item.ingredient).join(", "),
    macros: combined,
    confidence,
    matched: true,
    source: "usda_api",
  };
}

async function estimateFromEdamam(description: string): Promise<ResolvedMeal | null> {
  const appId = process.env.EDAMAM_APP_ID?.trim();
  const appKey = process.env.EDAMAM_APP_KEY?.trim();
  if (!appId || !appKey) {
    return null;
  }

  const ingredients = splitIngredients(description);
  if (ingredients.length === 0) {
    return null;
  }

  const total = ingredients.length;
  const resolved: Array<{ ingredient: string; quantity: number; macros: MacroTotals }> = [];

  for (const ingredient of ingredients) {
    const url = new URL("https://api.edamam.com/api/nutrition-data");
    url.searchParams.set("app_id", appId);
    url.searchParams.set("app_key", appKey);
    url.searchParams.set("nutrition-type", "cooking");
    url.searchParams.set("ingr", ingredient);

    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return null;
      }
      continue;
    }

    const payload = (await response.json()) as EdamamNutritionResponse;
    const nutrients = payload.totalNutrients ?? {};
    const calories = Number(payload.calories ?? 0);
    if (!Number.isFinite(calories) || calories <= 0) {
      continue;
    }

    const macros: MacroTotals = {
      calories: round(calories),
      protein: round(Number(nutrients.PROCNT?.quantity ?? 0)),
      carbs: round(Number(nutrients.CHOCDF?.quantity ?? 0)),
      fat: round(Number(nutrients.FAT?.quantity ?? 0)),
      fiber: round(Number(nutrients.FIBTG?.quantity ?? 0)),
    };

    resolved.push({
      ingredient,
      quantity: clampServings(parseLeadingQuantity(ingredient) ?? 1),
      macros,
    });
  }

  if (resolved.length === 0) {
    return null;
  }

  const combined = resolved.reduce(
    (sum, item) => addMacros(sum, item.macros),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
  const unresolvedCount = total - resolved.length;
  const confidence = confidenceForResolution(unresolvedCount);

  if (resolved.length === 1) {
    const [single] = resolved;
    if (!single) {
      return null;
    }
    return {
      label: titleCase(queryNameFromIngredient(single.ingredient) || single.ingredient),
      servingText: single.ingredient,
      servings: single.quantity,
      notes:
        unresolvedCount > 0
          ? `${unresolvedCount} item${unresolvedCount === 1 ? "" : "s"} could not be resolved by the nutrition API and were skipped.`
          : null,
      macros: combined,
      confidence,
      matched: true,
      source: "edamam_api",
    };
  }

  return {
    label: resolved.map((item) => titleCase(queryNameFromIngredient(item.ingredient))).join(" + "),
    servingText: `${resolved.length} items`,
    servings: 1,
    notes:
      unresolvedCount > 0
        ? `${unresolvedCount} item${unresolvedCount === 1 ? "" : "s"} could not be resolved by the nutrition API and were skipped.`
        : resolved.map((item) => item.ingredient).join(", "),
    macros: combined,
    confidence,
    matched: true,
    source: "edamam_api",
  };
}

export async function resolveMealFromText(description: string, mealSlot: MealSlot): Promise<ResolvedMeal> {
  try {
    const usdaResult = await estimateFromUsda(description);
    if (usdaResult) {
      return usdaResult;
    }
  } catch (error) {
    console.warn("USDA nutrition lookup failed:", error);
  }

  try {
    const edamamResult = await estimateFromEdamam(description);
    if (edamamResult) {
      return edamamResult;
    }
  } catch (error) {
    console.warn("Edamam nutrition lookup failed:", error);
  }

  const fallback = estimateMealFromText(description, mealSlot);
  return {
    ...fallback,
    source: fallback.matched ? "catalog" : "unclassified",
  };
}
