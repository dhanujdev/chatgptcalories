import { describe, expect, it } from "vitest";

import { WIDGET_URI, openDashboardToolMeta } from "../../server/src/toolMetadata.ts";

describe("openDashboardToolMeta", () => {
  it("keeps dashboard render metadata aligned with app hydration calls", () => {
    const meta = openDashboardToolMeta();

    expect(meta.ui.resourceUri).toBe(WIDGET_URI);
    expect(meta["openai/outputTemplate"]).toBe(WIDGET_URI);
    expect(meta.ui.visibility).toEqual(["model", "app"]);
  });
});
