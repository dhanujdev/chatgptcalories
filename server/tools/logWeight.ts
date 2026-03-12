import { z } from "zod";
import { insertWeightLog } from "../supabase/queries.js";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export const logWeightInput = {
  date: z.string().optional(),
  weight_lbs: z.number().min(50).max(700),
};

export const logWeight = {
  name: "log_weight",
  title: "Log body weight",
  description:
    "Record the user's body weight for a given date. " +
    "Use this when the user says 'I weigh 185 lbs' or 'weight check 180'.",
  inputSchema: logWeightInput,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },

  async execute({ date, weight_lbs }: { date?: string; weight_lbs: number }) {
    const nextDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayDate();
    await insertWeightLog({ date: nextDate, weight_lbs });

    return {
      content: [
        {
          type: "text" as const,
          text: `Weight logged: ${weight_lbs} lbs on ${nextDate}.`,
        },
      ],
    };
  },
};
