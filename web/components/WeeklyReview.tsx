import React from "react";
import type { WeeklyTrendPoint } from "../../shared/types.js";

function TrendBars({ points }: { points: WeeklyTrendPoint[] }) {
    const maxValue = Math.max(...points.map((p) => Math.max(p.target, p.calories)), 1);
    return (
        <div className="trend">
            {points.map((point) => (
                <div className="trend__column" key={point.date}>
                    <div className="trend__bars">
                        <div
                            className="trend__bar trend__bar--target"
                            style={{ height: `${(point.target / maxValue) * 100}%` }}
                        />
                        <div
                            className="trend__bar trend__bar--actual"
                            style={{ height: `${(point.calories / maxValue) * 100}%` }}
                        />
                    </div>
                    <span>
                        {new Date(`${point.date}T12:00:00Z`)
                            .toLocaleDateString("en-US", { weekday: "short" })
                            .slice(0, 2)}
                    </span>
                </div>
            ))}
        </div>
    );
}

export function WeeklyReview({ weeklyTrend, streak }: {
    weeklyTrend: WeeklyTrendPoint[];
    streak: number;
}) {
    return (
        <section className="panel trend-panel">
            <div className="section-head">
                <div>
                    <span className="eyebrow">Trend</span>
                    <h2>Last 7 days</h2>
                </div>
                <span>{streak} day streak</span>
            </div>
            <TrendBars points={weeklyTrend} />
        </section>
    );
}
