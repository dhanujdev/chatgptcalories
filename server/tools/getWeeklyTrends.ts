import { z } from "zod";
import { getWeekEntries, getGoals } from "../supabase/queries.js";
import { DEFAULT_GOALS } from "../../shared/constants.js";

function todayDate(): string {
    return new Date().toISOString().slice(0, 10);
}

function shiftDate(iso: string, offset: number): string {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
}

export const getWeeklyTrendsInput = {
    endDate: z.string().optional(),
};

export const getWeeklyTrends = {
    name: "get_weekly_trends",
    title: "Get weekly trends",
    description:
        "Returns the user's 7-day calorie and protein trends. " +
        "Use this when the user asks about patterns, progress, or weekly review.",
    inputSchema: getWeeklyTrendsInput,
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
    },

    async execute({ endDate }: { endDate?: string }) {
        const end = endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : todayDate();
        const entries = await getWeekEntries(end);
        const goalsRow = await getGoals();
        const targetCals = goalsRow?.daily_calories ?? DEFAULT_GOALS.calories;
        const targetProtein = goalsRow?.protein_grams ?? DEFAULT_GOALS.protein;

        // Group by date
        const byDate: Record<string, { calories: number; protein: number; count: number }> = {};
        for (let offset = -6; offset <= 0; offset++) {
            const d = shiftDate(end, offset);
            byDate[d] = { calories: 0, protein: 0, count: 0 };
        }

        for (const e of entries) {
            const bucket = byDate[e.local_date];
            if (bucket) {
                bucket.calories += e.calories;
                bucket.protein += e.protein_g;
                bucket.count += 1;
            }
        }

        const days = Object.entries(byDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, data]) => {
                const dayName = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short" });
                const delta = data.calories - targetCals;
                const deltaStr = delta >= 0 ? `+${Math.round(delta)}` : `${Math.round(delta)}`;
                return `${dayName} ${date}: ${Math.round(data.calories)} kcal (${deltaStr}), ${Math.round(data.protein)}g protein, ${data.count} meals`;
            });

        const avgCals = Math.round(
            Object.values(byDate).reduce((s, d) => s + d.calories, 0) / 7
        );
        const avgProtein = Math.round(
            Object.values(byDate).reduce((s, d) => s + d.protein, 0) / 7
        );

        const text =
            `📈 Weekly Trends (${shiftDate(end, -6)} → ${end})\n` +
            `Target: ${targetCals} kcal / ${targetProtein}g protein daily\n\n` +
            days.join("\n") + "\n\n" +
            `7-day average: ${avgCals} kcal, ${avgProtein}g protein`;

        return {
            content: [{ type: "text" as const, text }],
        };
    },
};
