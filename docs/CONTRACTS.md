# Contracts

This document captures the primary runtime contracts for the ChatGPT app.

## Tool Output Contract

The widget expects `structuredContent` that matches `ToolPayload`:

- `DashboardPayload`
  - `kind: "dashboard"`
  - `dashboard: DashboardSnapshot`
- `CatalogSearchPayload`
  - `kind: "catalogSearch"`
  - `query: string`
  - `results: CatalogResult[]`

Type definitions live in `shared/types.ts`.

## Core MCP Tools

### `open_calorie_dashboard`

- Purpose: load initial dashboard state for a date.
- Input: `{ date?: YYYY-MM-DD }`
- Output: `DashboardPayload`

### `load_day_snapshot`

- Purpose: refresh dashboard for a specific date without re-opening widget.
- Input: `{ date: YYYY-MM-DD }`
- Output: `DashboardPayload`

### `log_meal_from_text`

- Purpose: parse meal text, resolve nutrition, and persist entry.
- Input:
  - `date?: YYYY-MM-DD`
  - `mealSlot?: "breakfast" | "lunch" | "dinner" | "snack"`
  - `description: string`
  - `dedupeKey?: string`
- Output: `DashboardPayload`

### `search_food_catalog`

- Purpose: quick add search results for widget picker.
- Input: `{ query: string, limit?: 1..10 }`
- Output: `CatalogSearchPayload`

### `log_food_selection`

- Purpose: persist selected catalog item and return updated dashboard.
- Input:
  - `date?: YYYY-MM-DD`
  - `mealSlot: meal slot enum`
  - `foodId: string`
  - `servings?: 0.5..4`
  - `dedupeKey?: string`
- Output: `DashboardPayload`

## Database Contract (Current)

Primary write path:

- table: `food_entries`
- fields used by app:
  - identification: `id`, `user_id`, `status`
  - meal data: `meal`, `food_name`, `display_name`, `servings`, `serving_label`
  - macros: `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`
  - metadata: `source_kind`, `source_ref`, `provenance`, `confidence`, `notes`
  - date/time: `occurred_at`, `local_date`, `timezone`

Types live in `server/supabase/types.ts`.

## Compatibility Expectations

- Widget must tolerate delayed `toolOutput` and hydrate from bridge notifications.
- Tool contracts should be backwards compatible for existing deployed widgets.
- If a contract changes, update:
  1. `shared/types.ts`
  2. `shared/schemas.ts`
  3. this document
  4. tests that validate behavior
