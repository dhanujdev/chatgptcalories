import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  ConfidenceBand,
  GoalTargets,
  MacroTotals,
  MealEntry,
  MealSlot,
} from "../../shared/types.js";

/** Legacy source mapping: old store used "text" and "catalog". */
type LegacySource = MealEntry["source"];

type DayRecord = {
  entries: Array<MealEntry & { idempotencyKey?: string | null }>;
};

type JournalDb = {
  version: 1;
  lastMutationId: number;
  targets: GoalTargets;
  days: Record<string, DayRecord>;
};

type NewEntryInput = {
  date: string;
  mealSlot: MealSlot;
  source: MealEntry["source"];
  label: string;
  servingText: string;
  notes: string | null;
  confidence: ConfidenceBand;
  macros: MacroTotals;
  idempotencyKey?: string;
  photoStatus?: MealEntry["photoStatus"];
  photoFileId?: string | null;
};

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(isoDate: string, offset: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function entryFrom(
  date: string,
  mealSlot: MealSlot,
  source: MealEntry["source"],
  label: string,
  servingText: string,
  notes: string | null,
  confidence: ConfidenceBand,
  createdAt: string,
  macros: MacroTotals
): MealEntry {
  return {
    id: randomUUID(),
    date,
    mealSlot,
    source,
    label,
    servingText,
    notes,
    confidence,
    createdAt,
    macros,
  };
}

function seedTargets(): GoalTargets {
  return {
    calories: 2200,
    protein: 180,
    carbs: 190,
    fat: 70,
    fiber: 30,
  };
}

function createSeedDb(): JournalDb {
  const today = todayDate();
  const yesterday = shiftDate(today, -1);
  const twoDaysAgo = shiftDate(today, -2);
  const threeDaysAgo = shiftDate(today, -3);
  const fourDaysAgo = shiftDate(today, -4);

  return {
    version: 1,
    lastMutationId: 6,
    targets: seedTargets(),
    days: {
      [today]: {
        entries: [
          entryFrom(
            today,
            "breakfast",
            "text",
            "Eggs + sourdough",
            "2 eggs, 2 slices toast",
            "Strong protein start.",
            "high",
            `${today}T13:08:00.000Z`,
            { calories: 364, protein: 20.6, carbs: 42.8, fat: 12.6, fiber: 2.4 }
          ),
          entryFrom(
            today,
            "snack",
            "catalog",
            "Greek yogurt cup",
            "1 cup",
            null,
            "high",
            `${today}T16:30:00.000Z`,
            { calories: 130, protein: 23, carbs: 9, fat: 0, fiber: 0 }
          ),
        ],
      },
      [yesterday]: {
        entries: [
          entryFrom(
            yesterday,
            "breakfast",
            "catalog",
            "Protein oatmeal bowl",
            "1 bowl",
            null,
            "high",
            `${yesterday}T12:45:00.000Z`,
            { calories: 290, protein: 10, carbs: 49, fat: 6, fiber: 7 }
          ),
          entryFrom(
            yesterday,
            "lunch",
            "catalog",
            "Grilled chicken bowl",
            "1 bowl",
            null,
            "high",
            `${yesterday}T17:10:00.000Z`,
            { calories: 520, protein: 41, carbs: 48, fat: 15, fiber: 8 }
          ),
          entryFrom(
            yesterday,
            "dinner",
            "catalog",
            "Salmon rice bowl",
            "1 bowl",
            null,
            "high",
            `${yesterday}T23:20:00.000Z`,
            { calories: 610, protein: 36, carbs: 52, fat: 28, fiber: 4 }
          ),
        ],
      },
      [twoDaysAgo]: {
        entries: [
          entryFrom(
            twoDaysAgo,
            "lunch",
            "catalog",
            "Turkey sandwich",
            "1 sandwich",
            null,
            "high",
            `${twoDaysAgo}T17:30:00.000Z`,
            { calories: 430, protein: 32, carbs: 41, fat: 14, fiber: 5 }
          ),
          entryFrom(
            twoDaysAgo,
            "snack",
            "catalog",
            "Protein shake",
            "1 bottle",
            null,
            "high",
            `${twoDaysAgo}T20:30:00.000Z`,
            { calories: 180, protein: 30, carbs: 8, fat: 3, fiber: 1 }
          ),
        ],
      },
      [threeDaysAgo]: {
        entries: [
          entryFrom(
            threeDaysAgo,
            "breakfast",
            "catalog",
            "Avocado toast",
            "1 plate",
            null,
            "high",
            `${threeDaysAgo}T13:00:00.000Z`,
            { calories: 360, protein: 10, carbs: 31, fat: 22, fiber: 8 }
          ),
          entryFrom(
            threeDaysAgo,
            "dinner",
            "catalog",
            "Burrito bowl",
            "1 bowl",
            null,
            "high",
            `${threeDaysAgo}T23:10:00.000Z`,
            { calories: 670, protein: 42, carbs: 63, fat: 24, fiber: 11 }
          ),
        ],
      },
      [fourDaysAgo]: {
        entries: [
          entryFrom(
            fourDaysAgo,
            "dinner",
            "catalog",
            "Pepperoni pizza slice",
            "2 slices",
            "Recovery meal after a late work sprint.",
            "medium",
            `${fourDaysAgo}T23:35:00.000Z`,
            { calories: 570, protein: 24, carbs: 68, fat: 20, fiber: 4 }
          ),
        ],
      },
    },
  };
}

function normalizeDate(date: string | undefined): string {
  if (!date) {
    return todayDate();
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayDate();
}

export class JournalStore {
  private filePath: string;
  private cache: JournalDb | null = null;

  constructor(rootDir: string) {
    this.filePath = path.join(rootDir, "data", "journal.json");
  }

  private ensureLoaded(): JournalDb {
    if (this.cache) {
      return this.cache;
    }

    if (!existsSync(this.filePath)) {
      const seed = createSeedDb();
      this.persist(seed);
      return seed;
    }

    this.cache = JSON.parse(readFileSync(this.filePath, "utf8")) as JournalDb;
    return this.cache;
  }

  private persist(db: JournalDb): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(db, null, 2));
    renameSync(tempPath, this.filePath);
    this.cache = db;
  }

  private ensureDay(db: JournalDb, date: string): DayRecord {
    const key = normalizeDate(date);
    if (!db.days[key]) {
      db.days[key] = { entries: [] };
    }
    return db.days[key];
  }

  private mutate<T>(updater: (db: JournalDb) => T): T {
    const db = this.ensureLoaded();
    const result = updater(db);
    db.lastMutationId += 1;
    this.persist(db);
    return result;
  }

  read(): JournalDb {
    return structuredClone(this.ensureLoaded());
  }

  createOrReuseEntry(input: NewEntryInput): MealEntry {
    return this.mutate((db) => {
      const date = normalizeDate(input.date);
      const day = this.ensureDay(db, date);
      const existing = input.idempotencyKey
        ? day.entries.find((entry) => entry.idempotencyKey === input.idempotencyKey)
        : input.photoFileId
          ? day.entries.find((entry) => entry.photoFileId === input.photoFileId)
          : undefined;

      if (existing) {
        return existing;
      }

      const entry: MealEntry & { idempotencyKey?: string | null } = {
        id: randomUUID(),
        date,
        mealSlot: input.mealSlot,
        source: input.source,
        label: input.label,
        servingText: input.servingText,
        notes: input.notes,
        confidence: input.confidence,
        createdAt: new Date().toISOString(),
        macros: input.macros,
        photoStatus: input.photoStatus,
        photoFileId: input.photoFileId,
        idempotencyKey: input.idempotencyKey ?? null,
      };

      day.entries.unshift(entry);
      return entry;
    });
  }

  removeEntry(entryId: string): boolean {
    return this.mutate((db) => {
      for (const day of Object.values(db.days)) {
        const index = day.entries.findIndex((entry) => entry.id === entryId);
        if (index >= 0) {
          day.entries.splice(index, 1);
          return true;
        }
      }
      return false;
    });
  }

  updateTargets(nextTargets: Partial<GoalTargets>): GoalTargets {
    return this.mutate((db) => {
      db.targets = {
        ...db.targets,
        ...Object.fromEntries(
          Object.entries(nextTargets).filter(([, value]) => typeof value === "number")
        ),
      };
      return db.targets;
    });
  }

  normalizeDate(value: string | undefined): string {
    return normalizeDate(value);
  }
}

