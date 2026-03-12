import "dotenv/config";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// ─── Tool imports ────────────────────────────────────────────────────
import { logTextMeal, logTextMealInput } from "../tools/logTextMeal.js";
import { analyzeMeal, analyzeMealInput } from "../tools/analyzeMeal.js";
import { searchFood, searchFoodInput } from "../tools/searchFood.js";
import { getDailySummary, getDailySummaryInput } from "../tools/getDailySummary.js";
import { getWeeklyTrends, getWeeklyTrendsInput } from "../tools/getWeeklyTrends.js";
import { setGoals, setGoalsInput } from "../tools/setGoals.js";
import { updatePreferences, updatePreferencesInput } from "../tools/updatePreferences.js";
import { logWeight, logWeightInput } from "../tools/logWeight.js";
import { retrieveAgentContext, retrieveAgentContextInput } from "../tools/retrieveAgentContext.js";
import { saveMemoryFact, saveMemoryFactInput } from "../tools/saveMemoryFact.js";
import { getMemoryDashboard, getMemoryDashboardInput } from "../tools/getMemoryDashboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const WIDGET_URI = "ui://widget/calorie-command-v1.html";
const PORT = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";

// ─── Widget bundle ───────────────────────────────────────────────────

function readWidgetBundle(): { css: string; js: string } {
  const distDir = path.join(ROOT_DIR, "web", "dist");
  if (!existsSync(distDir)) {
    throw new Error(
      `Widget assets missing in ${distDir}. Run "npm run build:web" first.`
    );
  }

  const files = readdirSync(distDir);
  const jsFile = files.find((f) => f.endsWith(".js"));
  const cssFile = files.find((f) => f.endsWith(".css"));

  if (!jsFile) {
    throw new Error('No widget JS bundle found. Run "npm run build:web".');
  }

  return {
    js: readFileSync(path.join(distDir, jsFile), "utf8"),
    css: cssFile ? readFileSync(path.join(distDir, cssFile), "utf8") : "",
  };
}

function widgetHtml(): string {
  const bundle = readWidgetBundle();
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<title>Calorie Command</title>",
    bundle.css ? `<style>${bundle.css}</style>` : "",
    "</head>",
    "<body>",
    '<div id="root"></div>',
    `<script type="module">${bundle.js}</script>`,
    "</body>",
    "</html>",
  ].join("");
}

// ─── Helper ──────────────────────────────────────────────────────────

function toolStatus(invoking: string, invoked: string) {
  return {
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
  } as const;
}

// ─── MCP server factory ──────────────────────────────────────────────

function createAppServer(): McpServer {
  const server = new McpServer({
    name: "chatgpt-calories",
    version: "0.2.0",
  });

  // Widget resource
  registerAppResource(
    server,
    "calorie-command-widget",
    WIDGET_URI,
    {},
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml(),
          _meta: {
            ui: {
              prefersBorder: true,
              csp: { connectDomains: [], resourceDomains: [] },
            },
            "openai/widgetDescription":
              "An interactive calorie tracker with fast meal logging, macro pacing, and daily runway.",
          },
        },
      ],
    })
  );

  // ── Agent context (the key tool) ──
  registerAppTool(server, retrieveAgentContext.name, {
    title: retrieveAgentContext.title,
    description: retrieveAgentContext.description,
    inputSchema: retrieveAgentContextInput,
    annotations: retrieveAgentContext.annotations,
    _meta: {
      ui: { visibility: ["model"] },
      ...toolStatus("Loading your nutrition profile", "Context loaded"),
    },
  }, retrieveAgentContext.execute);

  // ── Log text meal ──
  registerAppTool(server, logTextMeal.name, {
    title: logTextMeal.title,
    description: logTextMeal.description,
    inputSchema: logTextMealInput,
    annotations: logTextMeal.annotations,
    _meta: {
      ui: { visibility: ["model", "app"] },
      ...toolStatus("Logging that meal", "Meal logged"),
    },
  }, logTextMeal.execute);

  // ── Analyze meal (ChatGPT sends structured data) ──
  registerAppTool(server, analyzeMeal.name, {
    title: analyzeMeal.title,
    description: analyzeMeal.description,
    inputSchema: analyzeMealInput,
    annotations: analyzeMeal.annotations,
    _meta: {
      ui: { visibility: ["model"] },
      ...toolStatus("Saving the meal analysis", "Analysis saved"),
    },
  }, analyzeMeal.execute);

  // ── Search food catalog ──
  registerAppTool(server, searchFood.name, {
    title: searchFood.title,
    description: searchFood.description,
    inputSchema: searchFoodInput,
    annotations: searchFood.annotations,
    _meta: {
      ui: { visibility: ["model", "app"] },
      ...toolStatus("Searching foods", "Results ready"),
    },
  }, searchFood.execute);

  // ── Daily summary ──
  registerAppTool(server, getDailySummary.name, {
    title: getDailySummary.title,
    description: getDailySummary.description,
    inputSchema: getDailySummaryInput,
    annotations: getDailySummary.annotations,
    _meta: {
      ui: { visibility: ["model"] },
      ...toolStatus("Loading daily summary", "Summary ready"),
    },
  }, getDailySummary.execute);

  // ── Weekly trends ──
  registerAppTool(server, getWeeklyTrends.name, {
    title: getWeeklyTrends.title,
    description: getWeeklyTrends.description,
    inputSchema: getWeeklyTrendsInput,
    annotations: getWeeklyTrends.annotations,
    _meta: {
      ui: { visibility: ["model"] },
      ...toolStatus("Loading weekly trends", "Trends ready"),
    },
  }, getWeeklyTrends.execute);

  // ── Set goals ──
  registerAppTool(server, setGoals.name, {
    title: setGoals.title,
    description: setGoals.description,
    inputSchema: setGoalsInput,
    annotations: setGoals.annotations,
    _meta: {
      ui: { visibility: ["model", "app"] },
      ...toolStatus("Saving targets", "Targets updated"),
    },
  }, setGoals.execute);

  // ── Update preferences ──
  registerAppTool(server, updatePreferences.name, {
    title: updatePreferences.title,
    description: updatePreferences.description,
    inputSchema: updatePreferencesInput,
    annotations: updatePreferences.annotations,
    _meta: {
      ui: { visibility: ["model"] },
      ...toolStatus("Saving preferences", "Preferences saved"),
    },
  }, updatePreferences.execute);

  // ── Log weight ──
  registerAppTool(server, logWeight.name, {
    title: logWeight.title,
    description: logWeight.description,
    inputSchema: logWeightInput,
    annotations: logWeight.annotations,
    _meta: {
      ui: { visibility: ["model"] },
      ...toolStatus("Logging weight", "Weight logged"),
    },
  }, logWeight.execute);

  // ── Save memory fact ──
  registerAppTool(server, saveMemoryFact.name, {
    title: saveMemoryFact.title,
    description: saveMemoryFact.description,
    inputSchema: saveMemoryFactInput,
    annotations: saveMemoryFact.annotations,
    _meta: {
      ui: { visibility: ["model"] },
      ...toolStatus("Remembering that", "Fact saved"),
    },
  }, saveMemoryFact.execute);

  // ── Memory dashboard ──
  registerAppTool(server, getMemoryDashboard.name, {
    title: getMemoryDashboard.title,
    description: getMemoryDashboard.description,
    inputSchema: getMemoryDashboardInput,
    annotations: getMemoryDashboard.annotations,
    _meta: {
      ui: { visibility: ["model"] },
      ...toolStatus("Loading memory", "Memory loaded"),
    },
  }, getMemoryDashboard.execute);

  return server;
}

// ─── HTTP server ─────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers?.host ?? "localhost"}`);
  const isMcpPath = url.pathname === MCP_PATH || url.pathname === "/api" || url.pathname === "/api/index";

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`Calorie MCP server running at http://${req.headers?.host ?? "localhost"}${MCP_PATH}`);
    return;
  }

  if (req.method === "OPTIONS" && isMcpPath) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  const allowedMethods = new Set(["GET", "POST", "DELETE"]);
  if (isMcpPath && req.method && allowedMethods.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createAppServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req as any, res as any);
      return;
    } catch (error) {
      console.error("Failed to handle MCP request", error);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal server error");
      }
      return;
    }
  }

  res.writeHead(404).end("Not found");
}

if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  const httpServer = createServer(handler);
  httpServer.listen(PORT, () => {
    console.log(`Calorie MCP server listening on http://localhost:${PORT}${MCP_PATH}`);
  });
}
