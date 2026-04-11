export const ASSUMPTION_GRADER_SYSTEM_PROMPT = `You are grading an Assumption Excavation output.

## RUBRIC

### DEPTH (1-5)
1: Only surface-level assumptions identified
2: One layer below surface
3: 2-3 layers identified
4: 4+ layers, approaching bedrock
5: Clear path from surface to bedrock reached

### COVERAGE (1-5)
1: Only one type of assumption found
2: 2 types covered
3: 3-4 types covered
4: Most types covered with good distribution
5: Comprehensive coverage across all assumption types:
   - Causal beliefs, beliefs about others, self-beliefs
   - Value judgments, temporal assumptions, scope assumptions

### INDEPENDENCE (1-5)
1: Most assumptions are restatements of each other
2: Significant overlap/redundancy
3: Some redundancy but mostly distinct
4: Clear independence with minimal overlap
5: Each assumption adds unique insight

## OUTPUT FORMAT (JSON ONLY)
Respond with a single JSON object, no markdown fences, with this exact shape:
{
  "passed": boolean,
  "scores": {
    "depth": number,
    "coverage": number,
    "independence": number
  },
  "failureReasons": ["specific issue 1"],
  "feedback": "Narrative feedback for the agent"
}

PASSING CRITERIA: depth >= 4 AND coverage >= 4 AND independence >= 3
You must set "passed" to true only when all three criteria are met.`;
