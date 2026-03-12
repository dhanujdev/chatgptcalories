import React, { useState } from "react";

type DraftItem = {
    food_name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    servings: number;
};

type MealDraft = {
    id: string;
    label: string;
    mealSlot: string;
    items: DraftItem[];
    confidence: "high" | "medium" | "low";
};

export function MealReview({ drafts, onConfirm, onReject }: {
    drafts: MealDraft[];
    onConfirm: (draftId: string) => void;
    onReject: (draftId: string) => void;
}) {
    if (drafts.length === 0) return null;

    return (
        <section className="panel meal-review">
            <div className="section-head">
                <div>
                    <span className="eyebrow">Pending review</span>
                    <h2>Confirm these entries</h2>
                </div>
                <span>{drafts.length} pending</span>
            </div>
            <div className="meal-review__list">
                {drafts.map((draft) => {
                    const totalCals = draft.items.reduce((s, i) => s + i.calories * i.servings, 0);
                    const totalProtein = draft.items.reduce((s, i) => s + i.protein * i.servings, 0);

                    return (
                        <div key={draft.id} className="meal-review__card">
                            <div className="meal-review__info">
                                <h3>{draft.label}</h3>
                                <p className="entry-row__meta">
                                    {draft.mealSlot} · {draft.items.length} items · {draft.confidence} confidence
                                </p>
                                <div className="meal-review__items">
                                    {draft.items.map((item, idx) => (
                                        <span key={idx} className="meal-review__item">
                                            {item.servings}x {item.food_name} ({item.calories} kcal)
                                        </span>
                                    ))}
                                </div>
                                <p className="meal-review__totals">
                                    <strong>{Math.round(totalCals)} kcal</strong> · {Math.round(totalProtein)}g protein
                                </p>
                            </div>
                            <div className="meal-review__actions">
                                <button
                                    type="button"
                                    className="cta"
                                    onClick={() => onConfirm(draft.id)}
                                >
                                    Confirm
                                </button>
                                <button
                                    type="button"
                                    className="soft-button"
                                    onClick={() => onReject(draft.id)}
                                >
                                    Reject
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
