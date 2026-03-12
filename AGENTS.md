# AGENTS

This file is for human and coding-agent contributors working in this repo.

## Project Goal

`chatgpt-calories` is a ChatGPT App with:

- an MCP server (`/mcp`) for tool execution
- a React widget rendered in ChatGPT
- Supabase-backed data for meals and goals

## Fast Start

```bash
npm install
npm run validate
npm run dev
```

## Core Commands

- `npm run build`: Build widget + server.
- `npm run check`: Build-only verification.
- `npm run lint`: ESLint checks.
- `npm run format`: Prettier write.
- `npm run format:check`: Prettier check-only.
- `npm run test`: Vitest unit + integration tests.
- `npm run test:coverage`: Test run with V8 coverage.
- `npm run validate`: Lint + format check + tests + build.

## Repo Layout

- `server/src`: MCP tool wiring and runtime behavior.
- `server/tools`: Reusable tool implementations.
- `server/supabase`: Data access layer.
- `web/src`: Main ChatGPT widget application.
- `shared`: Shared schema/type/constants.
- `tests/unit`: Pure function tests.
- `tests/integration`: Cross-module behavior tests.

## Guardrails

- Keep tool contracts stable; update docs if inputs/outputs change.
- Prefer deterministic tests over network-dependent tests.
- Never commit secrets; all API keys must come from environment variables.
- Treat tool results as user-visible product behavior. Changes should include tests.

## Environment Variables

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

Optional nutrition providers:

- `USDA_API_KEY`
- `EDAMAM_APP_ID`
- `EDAMAM_APP_KEY`

## Definition Of Done

Before merge:

1. `npm run validate` passes locally.
2. New behavior has tests.
3. README/docs are updated for operational changes.
4. No unrelated files are modified.
