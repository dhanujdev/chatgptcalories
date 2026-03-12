# ChatGPT Calories

`chatgpt-calories` is a ChatGPT App for calorie and macro tracking. It uses:

- A Node MCP server at `/mcp`
- A React widget rendered inside ChatGPT
- A decoupled tool shape so the dashboard stays mounted while the widget calls tools
- A Supabase-backed nutrition log and goals store
- A lightweight meal-photo capture flow that stores pending photo entries in the dashboard

## App shape

Primary archetype: `interactive-decoupled`

Why:

- calorie tracking is a repeated, stateful workflow
- the widget needs to stay mounted across many tool calls
- the UI benefits from app-initiated calls for search, logging, deletion, and date changes

Upstream examples used as the closest reference:

- Official `kitchen_sink_server_node` for lightweight widget-to-tool call patterns
- Official Pizzaz examples for the richer React/widget layout direction

## Tools

- `open_calorie_dashboard`
- `load_day_snapshot`
- `log_meal_from_text`
- `search_food_catalog`
- `log_food_selection`
- `update_goal_targets`
- `remove_meal_entry`
- `analyze_meal_photo`

## Local run

Set env vars in `.env` before running:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
USDA_API_KEY=... # optional, enables USDA nutrition lookups for text meal logging
EDAMAM_APP_ID=... # optional fallback nutrition provider
EDAMAM_APP_KEY=...
```

1. Install dependencies:

```bash
npm install
```

2. Build the widget and server:

```bash
npm run build
```

3. Start the MCP server:

```bash
npm start
```

4. Optional: run it in dev mode after a widget build:

```bash
npm run dev
```

The server listens on `http://localhost:8787/mcp`.

## Quality gates

Run the full local quality pipeline before pushing:

```bash
npm run validate
```

Useful individual commands:

- `npm run lint`
- `npm run format:check`
- `npm run test`
- `npm run test:coverage`
- `npm run check`

## ChatGPT setup

1. Expose your local server with HTTPS:

```bash
ngrok http 8787
```

2. In ChatGPT, enable **Settings -> Apps & Connectors -> Advanced settings -> Developer Mode**.
3. Create a new app using your public URL plus `/mcp`.
4. Refresh the app after tool or metadata changes.

## Validation ladder

Planned validation for this repo:

- Level 0: repo contract review
- Level 1: TypeScript/Vite build
- Level 2: unit + integration tests
- Level 3: local `/mcp` runtime sanity

## Documentation map

- Contributor/agent workflow: [AGENTS.md](./AGENTS.md)
- Architecture overview: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- Tool/data contracts: [docs/CONTRACTS.md](./docs/CONTRACTS.md)

## Docs used

- https://developers.openai.com/apps-sdk/quickstart/
- https://developers.openai.com/apps-sdk/build/mcp-server/
- https://developers.openai.com/apps-sdk/build/chatgpt-ui/
- https://developers.openai.com/apps-sdk/plan/tools/
- https://developers.openai.com/apps-sdk/reference/
- https://developers.openai.com/apps-sdk/build/examples/
- https://api.openai.com/v1/responses (OpenAPI example via docs MCP)
