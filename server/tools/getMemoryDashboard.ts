import { getMemoryFacts } from "../supabase/queries.js";

export const getMemoryDashboardInput = {};

export const getMemoryDashboard = {
  name: "get_memory_dashboard",
  title: "View memory dashboard",
  description:
    "List all stored memory facts about the user. " +
    "Use this when the user asks 'what do you know about me' or wants to review stored preferences.",
  inputSchema: getMemoryDashboardInput,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },

  async execute() {
    const facts = await getMemoryFacts();

    if (facts.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "🧠 No memory facts stored yet. As we chat, I'll learn and remember your preferences, goals, and health info.",
          },
        ],
      };
    }

    const grouped: Record<string, string[]> = {};
    for (const f of facts) {
      const cat = f.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat]!.push(f.fact_text);
    }

    const sections = Object.entries(grouped)
      .map(
        ([cat, items]) =>
          `**${cat.charAt(0).toUpperCase() + cat.slice(1)}**\n${items.map((i) => `  • ${i}`).join("\n")}`
      )
      .join("\n\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `🧠 Memory Dashboard (${facts.length} facts)\n\n${sections}`,
        },
      ],
    };
  },
};
