import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveMealFromText } from "../../server/src/nutritionResolver.ts";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("resolveMealFromText integration", () => {
  it("falls back to catalog estimates when no nutrition provider keys exist", async () => {
    delete process.env.USDA_API_KEY;
    delete process.env.EDAMAM_APP_ID;
    delete process.env.EDAMAM_APP_KEY;

    const result = await resolveMealFromText("2 eggs for breakfast", "breakfast");

    expect(result.source).toBe("catalog");
    expect(result.servings).toBe(2);
    expect(result.macros.calories).toBe(144);
  });

  it("uses USDA when an API key is configured and returns nutrient-derived macros", async () => {
    process.env.USDA_API_KEY = "test-usda-key";
    delete process.env.EDAMAM_APP_ID;
    delete process.env.EDAMAM_APP_KEY;

    const fetchMock = vi.fn(async () => {
      const body = {
        foods: [
          {
            description: "Egg, whole, raw",
            servingSize: 50,
            servingSizeUnit: "g",
            foodNutrients: [
              { nutrientId: 1008, value: 155 },
              { nutrientId: 1003, value: 13 },
              { nutrientId: 1005, value: 1.1 },
              { nutrientId: 1004, value: 11 },
              { nutrientId: 1079, value: 0 },
            ],
          },
        ],
      };
      return new Response(JSON.stringify(body), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveMealFromText("2 eggs", "breakfast");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("usda_api");
    expect(result.servings).toBe(2);
    expect(result.macros.calories).toBe(155);
    expect(result.macros.protein).toBe(13);
  });

  it("falls back to Edamam when USDA is unavailable and Edamam keys exist", async () => {
    delete process.env.USDA_API_KEY;
    process.env.EDAMAM_APP_ID = "test-app-id";
    process.env.EDAMAM_APP_KEY = "test-app-key";

    const fetchMock = vi.fn(async () => {
      const body = {
        calories: 190,
        totalNutrients: {
          PROCNT: { quantity: 8.5 },
          CHOCDF: { quantity: 24.1 },
          FAT: { quantity: 7.3 },
          FIBTG: { quantity: 3.6 },
        },
      };
      return new Response(JSON.stringify(body), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveMealFromText("1 apple with peanut butter", "snack");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("edamam_api");
    expect(result.macros.calories).toBe(190);
    expect(result.macros.protein).toBe(8.5);
    expect(result.macros.carbs).toBe(24.1);
  });
});
