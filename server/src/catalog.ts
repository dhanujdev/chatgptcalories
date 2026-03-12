import type { CatalogResult, MacroTotals, MealSlot } from "../../shared/types.js";

type FoodCatalogItem = CatalogResult & {
  aliases: string[];
  countWords?: string[];
};

type EstimatedMeal = {
  label: string;
  servingText: string;
  notes: string | null;
  macros: MacroTotals;
  confidence: "high" | "medium" | "low";
};

const mealDefaults: Record<MealSlot, string> = {
  breakfast: "oatmeal bowl",
  lunch: "grilled chicken bowl",
  dinner: "salmon rice bowl",
  snack: "greek yogurt",
};

function macros(
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number
): MacroTotals {
  return { calories, protein, carbs, fat, fiber };
}

export const FOOD_CATALOG: FoodCatalogItem[] = [
  {
    id: "egg",
    name: "Whole egg",
    brand: null,
    servingText: "1 egg",
    tags: ["breakfast", "protein", "quick"],
    aliases: ["egg", "eggs"],
    countWords: ["egg", "eggs"],
    macros: macros(72, 6.3, 0.4, 4.8, 0),
  },
  {
    id: "toast",
    name: "Sourdough toast",
    brand: null,
    servingText: "1 slice",
    tags: ["breakfast", "carbs"],
    aliases: ["toast", "sourdough toast"],
    countWords: ["slice", "slices", "toast"],
    macros: macros(110, 4, 21, 1.5, 1.2),
  },
  {
    id: "bacon",
    name: "Turkey bacon",
    brand: null,
    servingText: "2 strips",
    tags: ["breakfast", "savory"],
    aliases: ["bacon", "turkey bacon"],
    countWords: ["strip", "strips", "bacon"],
    macros: macros(86, 6, 0.4, 6.6, 0),
  },
  {
    id: "banana",
    name: "Banana",
    brand: null,
    servingText: "1 medium banana",
    tags: ["snack", "fruit", "preworkout"],
    aliases: ["banana", "bananas"],
    countWords: ["banana", "bananas"],
    macros: macros(105, 1.3, 27, 0.4, 3.1),
  },
  {
    id: "greek-yogurt",
    name: "Greek yogurt cup",
    brand: null,
    servingText: "1 cup",
    tags: ["snack", "protein", "breakfast"],
    aliases: ["greek yogurt", "yogurt"],
    countWords: ["cup", "cups", "yogurt"],
    macros: macros(130, 23, 9, 0, 0),
  },
  {
    id: "oatmeal",
    name: "Protein oatmeal bowl",
    brand: null,
    servingText: "1 bowl",
    tags: ["breakfast", "fiber", "carbs"],
    aliases: ["oatmeal", "oats", "porridge"],
    countWords: ["bowl", "bowls", "oatmeal"],
    macros: macros(290, 10, 49, 6, 7),
  },
  {
    id: "protein-shake",
    name: "Protein shake",
    brand: null,
    servingText: "1 bottle",
    tags: ["protein", "snack", "postworkout"],
    aliases: ["protein shake", "shake"],
    countWords: ["shake", "shakes", "bottle", "bottles"],
    macros: macros(180, 30, 8, 3, 1),
  },
  {
    id: "chicken-bowl",
    name: "Grilled chicken bowl",
    brand: null,
    servingText: "1 bowl",
    tags: ["lunch", "dinner", "protein"],
    aliases: ["chicken bowl", "grilled chicken bowl", "chicken rice bowl"],
    countWords: ["bowl", "bowls"],
    macros: macros(520, 41, 48, 15, 8),
  },
  {
    id: "salmon-bowl",
    name: "Salmon rice bowl",
    brand: null,
    servingText: "1 bowl",
    tags: ["dinner", "protein", "omega"],
    aliases: ["salmon bowl", "salmon rice bowl", "salmon"],
    countWords: ["bowl", "bowls"],
    macros: macros(610, 36, 52, 28, 4),
  },
  {
    id: "turkey-sandwich",
    name: "Turkey sandwich",
    brand: null,
    servingText: "1 sandwich",
    tags: ["lunch", "grab-and-go"],
    aliases: ["turkey sandwich", "sandwich"],
    countWords: ["sandwich", "sandwiches"],
    macros: macros(430, 32, 41, 14, 5),
  },
  {
    id: "caesar-salad",
    name: "Chicken caesar salad",
    brand: null,
    servingText: "1 salad",
    tags: ["lunch", "light"],
    aliases: ["caesar salad", "salad"],
    countWords: ["salad", "salads"],
    macros: macros(330, 18, 16, 21, 4),
  },
  {
    id: "pizza-slice",
    name: "Pepperoni pizza slice",
    brand: null,
    servingText: "1 slice",
    tags: ["treat", "dinner", "carbs"],
    aliases: ["pizza", "pizza slice", "pepperoni pizza"],
    countWords: ["slice", "slices", "pizza"],
    macros: macros(285, 12, 34, 10, 2),
  },
  {
    id: "burrito-bowl",
    name: "Burrito bowl",
    brand: null,
    servingText: "1 bowl",
    tags: ["lunch", "dinner", "high-volume"],
    aliases: ["burrito bowl", "chipotle bowl", "bowl"],
    countWords: ["bowl", "bowls"],
    macros: macros(670, 42, 63, 24, 11),
  },
  {
    id: "avocado-toast",
    name: "Avocado toast",
    brand: null,
    servingText: "1 plate",
    tags: ["breakfast", "healthy-fats"],
    aliases: ["avocado toast"],
    countWords: ["plate", "plates", "toast"],
    macros: macros(360, 10, 31, 22, 8),
  },
];

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function scaleMacros(base: MacroTotals, factor: number): MacroTotals {
  return {
    calories: round(base.calories * factor),
    protein: round(base.protein * factor),
    carbs: round(base.carbs * factor),
    fat: round(base.fat * factor),
    fiber: round(base.fiber * factor),
  };
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

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatScaledServingText(item: FoodCatalogItem, servings: number): string {
  if (servings === 1) {
    return item.servingText;
  }

  const baseMatch = item.servingText.match(/^1\s+(.+)$/i);
  if (!baseMatch) {
    return `${servings} x ${item.servingText}`;
  }

  let phrase = baseMatch[1] ?? item.servingText;
  const [singular, plural] = item.countWords ?? [];
  if (singular) {
    const chosen = servings === 1 ? singular : (plural ?? `${singular}s`);
    phrase = phrase.replace(new RegExp(`\\b${escapePattern(singular)}\\b`, "i"), chosen);
  }

  return `${servings} ${phrase}`;
}

function extractCount(description: string, item: FoodCatalogItem): number {
  const numericFallback = description.match(/\b(\d+(?:\.\d+)?)\b/);
  const aliasPattern = item.aliases.map(escapePattern).join("|");
  const countWordPattern = (item.countWords ?? []).map(escapePattern).join("|");

  if (countWordPattern.length > 0) {
    const beforeAlias = new RegExp(
      `\\b(\\d+(?:\\.\\d+)?)\\s*(?:${countWordPattern})?\\s*(?:of\\s+)?(?:${aliasPattern})\\b`,
      "i"
    );
    const aliasThenWord = new RegExp(
      `\\b(?:${aliasPattern})\\b[^\\d]{0,12}\\b(\\d+(?:\\.\\d+)?)\\s*(?:${countWordPattern})\\b`,
      "i"
    );

    const beforeMatch = description.match(beforeAlias);
    if (beforeMatch?.[1]) {
      return Number(beforeMatch[1]);
    }

    const afterMatch = description.match(aliasThenWord);
    if (afterMatch?.[1]) {
      return Number(afterMatch[1]);
    }
  }

  if (item.aliases.length === 1 && numericFallback?.[1]) {
    return Number(numericFallback[1]);
  }

  return 1;
}

export function searchFoodCatalog(query: string, limit = 6): CatalogResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return FOOD_CATALOG.slice(0, limit).map(({ aliases: _aliases, countWords: _countWords, ...item }) => item);
  }

  const ranked = FOOD_CATALOG.map((item) => {
    const haystack = [item.name, item.brand ?? "", ...item.tags, ...item.aliases]
      .join(" ")
      .toLowerCase();
    const exact = haystack.includes(normalized) ? 100 : 0;
    const tokenMatches = normalized
      .split(/\s+/)
      .filter(Boolean)
      .reduce((score, token) => score + (haystack.includes(token) ? 12 : 0), 0);
    return { item, score: exact + tokenMatches };
  })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ item }) => {
      const { aliases: _aliases, countWords: _countWords, ...result } = item;
      return result;
    });

  return ranked;
}

export function findCatalogItem(id: string): FoodCatalogItem | undefined {
  return FOOD_CATALOG.find((item) => item.id === id);
}

export function estimateMealFromText(
  description: string,
  mealSlot: MealSlot
): EstimatedMeal {
  const normalized = description.trim().toLowerCase();
  const matched = FOOD_CATALOG.filter((item) =>
    item.aliases.some((alias) => normalized.includes(alias))
  );

  if (matched.length === 0) {
    const fallback = FOOD_CATALOG.find(
      (item) => item.aliases[0] === mealDefaults[mealSlot]
    );

    if (!fallback) {
      return {
        label: "Estimated meal",
        servingText: "1 entry",
        notes: "No strong food match found, so this is a conservative placeholder.",
        macros: macros(420, 24, 38, 16, 5),
        confidence: "low",
      };
    }

    return {
      label: description.trim(),
      servingText: fallback.servingText,
      notes: `No exact food match found. Used ${fallback.name.toLowerCase()} as the closest template.`,
      macros: fallback.macros,
      confidence: "low",
    };
  }

  const estimated = matched.map((item) => {
    const servings = Math.max(0.5, Math.min(extractCount(normalized, item), 4));
    return {
      name: item.name,
      servings,
      macros: scaleMacros(item.macros, servings),
    };
  });

  const total = estimated.reduce(
    (sum, current) => addMacros(sum, current.macros),
    macros(0, 0, 0, 0, 0)
  );

  const firstMatch = matched[0];
  const label =
    matched.length === 1 && firstMatch
      ? firstMatch.name
      : matched
          .map((item) => item.name.replace(/\b(bowl|cup|slice|plate)\b/gi, "").trim())
          .join(" + ");

  return {
    label,
    servingText:
      matched.length === 1 && firstMatch
        ? formatScaledServingText(firstMatch, estimated[0]?.servings ?? 1)
        : `${matched.length} matched foods`,
    notes:
      matched.length > 1
        ? estimated.map((item) => `${item.servings}x ${item.name}`).join(", ")
        : null,
    macros: total,
    confidence: matched.length > 1 ? "medium" : "high",
  };
}
