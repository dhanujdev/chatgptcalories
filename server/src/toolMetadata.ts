export const WIDGET_URI = "ui://widget/calorie-command-v12.html";

export function openDashboardToolMeta(widgetUri: string = WIDGET_URI) {
  return {
    ui: {
      resourceUri: widgetUri,
      visibility: ["model", "app"] as const,
    },
    "openai/outputTemplate": widgetUri,
    "openai/toolInvocation/invoking": "Opening calorie dashboard",
    "openai/toolInvocation/invoked": "Dashboard ready",
  };
}
