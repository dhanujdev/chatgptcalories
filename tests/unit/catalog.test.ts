import { describe, expect, it } from "vitest";

import { estimateMealFromText } from "../../server/src/catalog.ts";

describe("estimateMealFromText", () => {
  it("parses servings for direct quantity phrases", () => {
    const result = estimateMealFromText("2 eggs for breakfast", "breakfast");

    expect(result.label).toBe("Whole egg");
    expect(result.servings).toBe(2);
    expect(result.servingText).toContain("2");
    expect(result.macros.calories).toBe(144);
    expect(result.matched).toBe(true);
  });

  it("matches apples correctly and does not substitute to yogurt", () => {
    const result = estimateMealFromText("apples", "snack");

    expect(result.label).toBe("Apple");
    expect(result.macros.calories).toBe(95);
    expect(result.matched).toBe(true);
  });

  it("returns unclassified zero-macro entries for unknown text", () => {
    const result = estimateMealFromText("dragonfruit cloud meteor", "lunch");

    expect(result.matched).toBe(false);
    expect(result.macros).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
    });
    expect(result.confidence).toBe("low");
  });
});
