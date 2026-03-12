# Architecture

## High-Level

`chatgpt-calories` uses an interactive decoupled Apps SDK architecture:

1. ChatGPT invokes MCP tools exposed at `/mcp`.
2. Tool handlers read/write Supabase.
3. Tool handlers return `structuredContent` payloads.
4. Widget consumes payloads and renders dashboard state.
5. Widget can call tools directly using MCP Apps bridge (`tools/call`).

## Runtime Components

- MCP server entry: `server/src/index.ts`
- Widget tool orchestration: `server/src/widgetTools.ts`
- Nutrition resolution:
  - Catalog estimate fallback: `server/src/catalog.ts`
  - API-first resolver: `server/src/nutritionResolver.ts`
- Persistence: `server/supabase/queries.ts`
- Widget UI: `web/src/main.tsx`

## Data Flow

### Open Dashboard

1. `open_calorie_dashboard` is invoked.
2. Server builds `DashboardPayload`.
3. Payload is returned as `structuredContent`.
4. Widget renders `DashboardSnapshot`.

### Text Meal Logging

1. `log_meal_from_text` receives user text.
2. Resolver tries USDA, then Edamam, then catalog fallback.
3. Normalized macros are inserted into `food_entries`.
4. Updated dashboard payload is returned.

## Reliability Notes

- Dedupe keys prevent duplicate log entries from repeated calls.
- Nutrition resolution falls back safely to unclassified zero-macro entries instead of hallucinated substitutions.
- Widget now auto-hydrates when initial payload is missing and provides manual recovery.

## Deployment Notes

- Vercel rewrites `/mcp` to `api/index.ts` (see `vercel.json`).
- Production requires Supabase env vars and optional nutrition provider keys.
