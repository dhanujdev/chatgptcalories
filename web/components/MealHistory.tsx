import React from "react";
import type { MealEntry, MealGroup } from "../../shared/types.js";

function EntryRow({ entry, onRemove }: {
    entry: MealEntry;
    onRemove: (entry: MealEntry) => void;
}) {
    return (
        <button className="entry-row" type="button" onClick={() => onRemove(entry)}>
            <div>
                <p className="entry-row__title">{entry.label}</p>
                <p className="entry-row__meta">
                    {entry.servingText}
                    {entry.photoStatus === "pending" ? " · pending photo estimate" : ""}
                </p>
            </div>
            <div className="entry-row__stats">
                <strong>{Math.round(entry.macros.calories)} kcal</strong>
                <span>{Math.round(entry.macros.protein)}p</span>
            </div>
        </button>
    );
}

function MealSection({ group, onRemove }: {
    group: MealGroup;
    onRemove: (entry: MealEntry) => void;
}) {
    return (
        <section className="meal-section">
            <div className="meal-section__head">
                <div>
                    <span className="eyebrow">{group.label}</span>
                    <h3>{group.mealSlot}</h3>
                </div>
                <div className="meal-section__totals">
                    <strong>{Math.round(group.totals.calories)} kcal</strong>
                    <span>{Math.round(group.totals.protein)}p</span>
                </div>
            </div>
            {group.entries.length === 0 ? (
                <div className="meal-section__empty">Nothing logged yet.</div>
            ) : (
                <div className="meal-section__rows">
                    {group.entries.map((entry) => (
                        <EntryRow key={entry.id} entry={entry} onRemove={onRemove} />
                    ))}
                </div>
            )}
        </section>
    );
}

export function MealHistory({ mealGroups, onRemove }: {
    mealGroups: MealGroup[];
    onRemove: (entry: MealEntry) => void;
}) {
    const totalEntries = mealGroups.reduce((sum, g) => sum + g.entries.length, 0);

    return (
        <section className="panel meal-board">
            <div className="section-head">
                <div>
                    <span className="eyebrow">Daily board</span>
                    <h2>Every meal in one scroll</h2>
                </div>
                <span>{totalEntries} entries</span>
            </div>
            <div className="meal-board__grid">
                {mealGroups.map((group) => (
                    <MealSection key={group.mealSlot} group={group} onRemove={onRemove} />
                ))}
            </div>
        </section>
    );
}
