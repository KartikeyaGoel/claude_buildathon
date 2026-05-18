import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { interrogateInputSchema, interrogateTool } from "./tools/interrogate.js";
import {
  reportFollowupContextInputSchema,
  reportFollowupContextTool,
} from "./tools/reportFollowupContext.js";
import { reportOutcomeInputSchema, reportOutcomeTool } from "./tools/reportOutcome.js";
import {
  reportPositionCommitmentInputSchema,
  reportPositionCommitmentTool,
} from "./tools/reportPositionCommitment.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "crucible",
    version: "0.1.0",
  });

  server.registerTool(
    "interrogate",
    {
      title: "Interrogate content (Cognitive Gym)",
      description:
        "Run Crucible's adversarial deliberation pipeline. Requires user_position: infer the user's committed position from conversation context before calling (never optional). If genuinely uninferable, ask exactly one stakes-bearing question first. If the user has no position, pass user_position: \"no prior position, approaching fresh\". Returns full raw deliberation by stage plus position-aware synthesis. You must present one agent disagreement as a single judgment question before synthesis, then one forced closing recommitment question; call report_position_commitment after the user's final answer.",
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
    "report_position_commitment",
    {
      title: "Report position commitment",
      description:
        "Record the user's final position after Cognitive Gym recommitment (pairs with the initial user_position from interrogate).",
      inputSchema: reportPositionCommitmentInputSchema,
    },
    reportPositionCommitmentTool,
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
