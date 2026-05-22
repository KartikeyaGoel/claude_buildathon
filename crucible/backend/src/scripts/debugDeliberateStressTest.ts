import { config } from "dotenv";
config();

import { userFromPlaintextApiKey } from "../mcp/auth.js";
import { runGate } from "../services/engine/gating.js";
import { runLightweightFraming } from "../services/engine/mcpFraming.js";
import { runNegativeSpacePass } from "../services/engine/negativeSpace.js";
import { runLayeredAssumptionExcavation } from "../services/engine/layeredExcavation.js";
import { runParallelAgents } from "../services/engine/parallelAgents.js";
import { judgeAssumptions } from "../services/engine/validityJudge.js";
import { runTemporalStackPass } from "../services/engine/temporalStack.js";

const args = {
  content: "We should sign the term sheet by EOD tomorrow. The metrics are strong and the window is closing.",
  context:
    "Meridian AI is a vertical SaaS company building workflow automation for mid-market insurance carriers. They are raising a $12M Series A at a $48M pre-money valuation. The round is being led by Benchmark with a $72-hour exclusivity window. Key metrics: $2.4M ARR, 3.1x year-over-year growth, 94% gross retention. The founder previously sold a company to Salesforce. We have a $2M allocation.",
  user_position:
    "We should sign the term sheet by EOD tomorrow. The metrics are strong and the window is closing.",
  domain: "financial" as const,
};

const fullContent = `${args.content}\n\nContext:\n${args.context}`;
const userPosition = args.user_position;
const pipelineStart = Date.now();

function log(stage: string, extra = "") {
  console.log(`[+${((Date.now() - pipelineStart) / 1000).toFixed(1)}s] ${stage}${extra ? ` — ${extra}` : ""}`);
}

async function runStage<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    log(`OK ${name}`, `${Date.now() - t0}ms`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const maybe = error as { code?: string; failures?: Array<{ role: string; error: string }> };
    log(`FAIL ${name}`, `${Date.now() - t0}ms: ${message}`);
    if (maybe.failures?.length) {
      for (const f of maybe.failures) console.log(`       ${f.role}: ${f.error}`);
    }
    throw error;
  }
}

console.log("=== deliberate stress-test debug (exact user payload) ===");
console.log(`content+context chars: ${fullContent.length}`);

const _user = await userFromPlaintextApiKey(process.env.CRUCIBLE_API_KEY!);
void _user;

const gate = await runStage("gate", () => runGate(fullContent, undefined, userPosition));
log(`gate passed=${gate.passed} reason=${gate.reason?.slice(0, 80)}`);
if (!gate.passed) process.exit(0);

const framingText = await runStage("framing", () =>
  runLightweightFraming({ content: fullContent, userPosition }),
);

const agents = await runStage("parallelAgents", () => runParallelAgents(fullContent, userPosition));
for (const r of agents.results) log(`  agent ${r.role}`, `${r.latencyMs}ms timedOut=${r.timedOut}`);
for (const f of agents.failures) log(`  FAILED ${f.role}`, f.error);

await runStage("negativeSpace", () =>
  runNegativeSpacePass({ content: fullContent, framingText, userPosition }),
);

const layeredExcavation = await runStage("layeredExcavation", () =>
  runLayeredAssumptionExcavation({ content: fullContent, framingText, userPosition }),
);
log(`  excavation latency ${layeredExcavation.latencyMs}ms timedOut=${layeredExcavation.timedOut}`);

const judgeInputs = [...agents.results, layeredExcavation];
const assumptions = await runStage("validityJudge", () =>
  judgeAssumptions(judgeInputs, undefined, userPosition),
);
log(`  assumptions=${assumptions.length}`);

const temporal = await runStage("temporalStack", () =>
  runTemporalStackPass({ content: fullContent, framingText, assumptions }),
);

log(`DONE total=${((Date.now() - pipelineStart) / 1000).toFixed(1)}s temporal stacks=${temporal.stacks.length}`);
