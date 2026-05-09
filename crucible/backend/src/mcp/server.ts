import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { interrogateInputSchema, interrogateTool } from "./tools/interrogate.js";
import {
  reportFollowupContextInputSchema,
  reportFollowupContextTool,
} from "./tools/reportFollowupContext.js";
import { reportOutcomeInputSchema, reportOutcomeTool } from "./tools/reportOutcome.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "crucible",
    version: "0.1.0",
  });

  server.registerTool(
    "interrogate",
    {
      title: "Interrogate content",
      description: "Run Crucible's multi-model epistemic interrogation pipeline.",
      inputSchema: interrogateInputSchema,
    },
    interrogateTool,
  );

  server.registerTool(
    "report_outcome",
    {
      title: "Report outcome",
      description: "Record a decision outcome for a prior Crucible interrogation.",
      inputSchema: reportOutcomeInputSchema,
    },
    reportOutcomeTool,
  );

  server.registerTool(
    "report_followup_context",
    {
      title: "Report follow-up context",
      description:
        "Record the next few user/assistant messages after a Crucible interrogation so Crucible can evaluate downstream reasoning changes.",
      inputSchema: reportFollowupContextInputSchema,
    },
    reportFollowupContextTool,
  );

  return server;
}

export async function startStdioMcpServer(): Promise<void> {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}
