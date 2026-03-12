import React from "react";
import type { MacroTotals, GoalTargets, DaySummary } from "../../shared/types.js";

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function fraction(value: number, target: number): number {
    if (target <= 0) return 0;
    return clamp(value / target, 0, 1.2);
}

function macroLabel(macro: keyof MacroTotals): string {
    switch (macro) {
        case "protein": return "Protein";
        case "carbs": return "Carbs";
        case "fat": return "Fat";
        case "fiber": return "Fiber";
        default: return "Calories";
    }
}

function MacroMeter({ label, value, target, accent }: {
    label: string;
    value: number;
    target: number;
    accent: string;
}) {
    const pct = fraction(value, target);
    return (
        <div className="macro-meter">
            <div className="macro-meter__head">
                <span>{label}</span>
                <strong>{Math.round(value)} / {Math.round(target)}</strong>
            </div>
            <div className="macro-meter__track">
                <div
                    className="macro-meter__fill"
                    style={{ width: `${Math.min(pct, 1) * 100}%`, background: accent }}
                />
            </div>
        </div>
    );
}

export function DailyProgress({ summary }: { summary: DaySummary }) {
    const calorieFraction = fraction(summary.totals.calories, summary.targets.calories);

    const heroStyle = {
        background: `conic-gradient(#ff6b3d ${Math.min(calorieFraction, 1) * 360}deg, rgba(255,107,61,0.16) 0deg)`,
    };

    return (
        <div className="daily-progress">
            <div className="hero__ring-wrap">
                <div className="hero__ring" style={heroStyle}>
                    <div className="hero__ring-core">
                        <span>Consumed</span>
                        <strong>{Math.round(summary.totals.calories)}</strong>
                        <small>of {summary.targets.calories} kcal</small>
                    </div>
                </div>
                <div className="hero__badges">
                    <span>{summary.momentumLabel}</span>
                    <span>{summary.streak} day streak</span>
                    <span>{summary.adherenceScore}/100</span>
                </div>
            </div>

            <div className="metric-grid">
                <MacroMeter
                    label={macroLabel("protein")}
                    value={summary.totals.protein}
                    target={summary.targets.protein}
                    accent="linear-gradient(90deg, #7ac7a4, #4aa383)"
                />
                <MacroMeter
                    label={macroLabel("carbs")}
                    value={summary.totals.carbs}
                    target={summary.targets.carbs}
                    accent="linear-gradient(90deg, #f4c15d, #d8891f)"
                />
                <MacroMeter
                    label={macroLabel("fat")}
                    value={summary.totals.fat}
                    target={summary.targets.fat}
                    accent="linear-gradient(90deg, #ff9d7a, #ff6b3d)"
                />
                <MacroMeter
                    label={macroLabel("fiber")}
                    value={summary.totals.fiber}
                    target={summary.targets.fiber ?? 30}
                    accent="linear-gradient(90deg, #9cb7ff, #617dff)"
                />
            </div>

            <p className="coach-note">{summary.coachNote}</p>
        </div>
    );
}
