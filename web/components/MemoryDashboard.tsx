import React from "react";

type MemoryFact = {
  id: string;
  factText: string;
  category: string;
  source: string;
  createdAt: string;
};

export function MemoryDashboard({
  facts,
  onDeactivate,
}: {
  facts: MemoryFact[];
  onDeactivate?: (factId: string) => void;
}) {
  if (facts.length === 0) {
    return (
      <section className="panel memory-dashboard">
        <div className="section-head">
          <div>
            <span className="eyebrow">Memory</span>
            <h2>What I know about you</h2>
          </div>
        </div>
        <p className="meal-section__empty">
          No memory facts yet. As we chat, I'll learn and remember your preferences.
        </p>
      </section>
    );
  }

  const grouped: Record<string, MemoryFact[]> = {};
  for (const f of facts) {
    const cat = f.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat]!.push(f);
  }

  return (
    <section className="panel memory-dashboard">
      <div className="section-head">
        <div>
          <span className="eyebrow">Memory</span>
          <h2>What I know about you</h2>
        </div>
        <span>{facts.length} facts</span>
      </div>
      <div className="memory-dashboard__groups">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="memory-dashboard__group">
            <h3 className="memory-dashboard__category">
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </h3>
            <div className="meal-section__rows">
              {items.map((fact) => (
                <div key={fact.id} className="entry-row">
                  <div>
                    <p className="entry-row__title">{fact.factText}</p>
                    <p className="entry-row__meta">
                      {fact.source} · {new Date(fact.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {onDeactivate && (
                    <button
                      type="button"
                      className="soft-button"
                      onClick={() => onDeactivate(fact.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
