import { z } from "zod";
import { searchFoodCatalog } from "../src/catalog.js";

export const searchFoodInput = {
  query: z.string().min(1),
  limit: z.number().int().min(1).max(10).optional(),
};

export const searchFood = {
  name: "search_food",
  title: "Search food catalog",
  description:
    "Search the built-in food catalog for quick-add items. " +
    "Use this when the user wants to find a specific food or browse options. " +
    "Returns matching foods with macros per serving.",
  inputSchema: searchFoodInput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },

  async execute({ query, limit }: { query: string; limit?: number }) {
    const results = searchFoodCatalog(query, limit ?? 6);

    if (results.length === 0) {
      return {
        content: [{ type: "text" as const, text: `No foods found matching "${query}".` }],
      };
    }

    const formatted = results
      .map(
        (r) =>
          `• ${r.name} (${r.servingText}) — ${r.macros.calories} kcal, ${r.macros.protein}g protein`
      )
      .join("\n");

    return {
      content: [{ type: "text" as const, text: `Found ${results.length} foods:\n${formatted}` }],
    };
  },
};
