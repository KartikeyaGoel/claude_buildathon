import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { commitInputSchema, commitTool } from "./tools/commit.js";
import { deliberateInputSchema, deliberateTool } from "./tools/deliberate.js";
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
import { synthesizeInputSchema, synthesizeTool } from "./tools/synthesize.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "crucible",
    version: "0.2.0",
  });

  server.registerTool(
    "deliberate",
    {
      title: "Deliberate (Cognitive Gym step 1)",
      description:
        "Run Crucible adversarial deliberation WITHOUT synthesis. Requires user_position. Returns raw deliberation stages and ONE disagreement question. Synthesis is locked until the user answers and you call `synthesize`. Infer user_position from context; if uninferable ask one stakes-bearing question first.",
      inputSchema: deliberateInputSchema,
    },
    deliberateTool,
  );

  server.registerTool(
    "synthesize",
    {
      title: "Synthesize (Cognitive Gym step 2)",
      description:
        "After the user answers the disagreement question from `deliberate`, pass their judgment as user_judgment. Returns position-aware synthesis and a closing recommitment question. Then call `commit` after the user answers.",
      inputSchema: synthesizeInputSchema,
    },
    synthesizeTool,
  );

  server.registerTool(
    "commit",
    {
      title: "Commit position (Cognitive Gym step 3)",
      description:
        "Record the user's final position after synthesis and close the gym loop. Required to capture position delta for training. Pass final_position in the user's own words.",
      inputSchema: commitInputSchema,
    },
    commitTool,
  );

  server.registerTool(
    "interrogate",
    {
      title: "Interrogate (deprecated — use deliberate)",
      description:
        "DEPRECATED: aliases to `deliberate` (deliberation only, no synthesis). Use deliberate → synthesize → commit instead.",
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
      title: "Report position commitment (deprecated — use commit)",
      description: "DEPRECATED: use `commit` instead, which closes the staged gym loop.",
      inputSchema: reportPositionCommitmentInputSchema,
    },
    reportPositionCommitmentTool,
  );

  server.registerTool(
    "report_followup_context",
    {
      title: "Report follow-up context",
      description:
        "Optional: record conversation messages after a completed gym loop for calibration research.",
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
