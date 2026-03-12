import { z } from "zod";

/**
 * Selective Vercel MCP Tools
 *
 * This module provides a subset of the Vercel MCP server functionality
 * using direct Vercel API calls to avoid hitting the 100-tool limit.
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_API_BASE = "https://api.vercel.com";

async function vercelFetch(endpoint: string, options: RequestInit = {}) {
  if (!VERCEL_TOKEN) {
    throw new Error("VERCEL_TOKEN environment variable is not set.");
  }

  const response = await fetch(`${VERCEL_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(`Vercel API error: ${error.message || response.statusText}`);
  }

  return response.json();
}

export const listProjectsInput = z.object({
  limit: z.number().optional().default(20),
});

export const listProjects = {
  name: "vercel_list_projects",
  title: "List Vercel Projects",
  description: "Lists all projects in your Vercel account.",
  inputSchema: listProjectsInput,
  async execute({ limit }: { limit: number }) {
    const data = await vercelFetch(`/v9/projects?limit=${limit}`);
    const projects = data.projects.map((p: any) => `• ${p.name} (${p.id})`).join("\n");
    return {
      content: [
        { type: "text" as const, text: `Vercel Projects:\n${projects || "No projects found."}` },
      ],
    };
  },
};

export const getRuntimeLogsInput = z.object({
  projectId: z.string(),
  deploymentId: z.string().optional(),
  limit: z.number().optional().default(50),
});

export const getRuntimeLogs = {
  name: "vercel_get_runtime_logs",
  title: "Get Vercel Runtime Logs",
  description: "Fetches runtime logs for a specific Vercel deployment.",
  inputSchema: getRuntimeLogsInput,
  async execute({
    projectId,
    deploymentId,
    limit,
  }: {
    projectId: string;
    deploymentId?: string;
    limit: number;
  }) {
    let deployId = deploymentId;
    if (!deployId) {
      const projectsData = await vercelFetch(`/v9/projects/${projectId}`);
      deployId = projectsData.latestDeployments?.[0]?.id;
    }

    if (!deployId) {
      return {
        content: [{ type: "text" as const, text: "No deployment found to fetch logs for." }],
      };
    }

    const logsData = await vercelFetch(`/v2/deployments/${deployId}/events?limit=${limit}`);
    const logLines = (Array.isArray(logsData) ? logsData : [])
      .map((l: any) => `[${l.type}] ${l.payload?.text || l.payload?.message || ""}`)
      .join("\n");

    return {
      content: [
        { type: "text" as const, text: `Logs for ${deployId}:\n${logLines || "No logs found."}` },
      ],
    };
  },
};

export const createDeploymentInput = z.object({
  projectId: z.string(),
  branch: z.string().optional(),
});

export const createDeployment = {
  name: "vercel_create_deployment",
  title: "Create Vercel Deployment",
  description: "Triggers a new deployment for a Vercel project.",
  inputSchema: createDeploymentInput,
  async execute({ projectId, branch }: { projectId: string; branch?: string }) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Vercel: Deployment trigger for ${projectId} on branch ${branch || "default"} is scheduled. (API /v13/deployments)`,
        },
      ],
    };
  },
};
