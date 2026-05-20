export const ASSUMPTION_VISIBILITY = ["explicit", "unstated", "implicit", "contextual"] as const;
export type AssumptionVisibility = (typeof ASSUMPTION_VISIBILITY)[number];

export const ASSUMPTION_LENS = [
  "selection",
  "identity",
  "incentive",
  "temporal",
  "taboo",
  "optionality",
  "second_order",
] as const;
export type AssumptionLens = (typeof ASSUMPTION_LENS)[number];

export interface AssumptionTaxonomyFields {
  visibility?: AssumptionVisibility;
  lens?: AssumptionLens;
  load_bearing?: boolean;
}

export interface ImplicitAssumptionSurfaced {
  assumption: string;
  lens: AssumptionLens | string;
  visibility: AssumptionVisibility | string;
  why_implicit: string;
  test: string;
}

function isVisibility(value: unknown): value is AssumptionVisibility {
  return typeof value === "string" && (ASSUMPTION_VISIBILITY as readonly string[]).includes(value);
}

function isLens(value: unknown): value is AssumptionLens {
  return typeof value === "string" && (ASSUMPTION_LENS as readonly string[]).includes(value);
}

export function parseVisibility(value: unknown): AssumptionVisibility | undefined {
  return isVisibility(value) ? value : undefined;
}

export function parseLens(value: unknown): AssumptionLens | undefined {
  return isLens(value) ? value : undefined;
}

export function parseLoadBearing(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1) return true;
  if (value === "false" || value === 0) return false;
  return undefined;
}

export function parseTaxonomyFromRaw(raw: Record<string, unknown>): AssumptionTaxonomyFields {
  return {
    visibility: parseVisibility(raw.visibility),
    lens: parseLens(raw.lens),
    load_bearing: parseLoadBearing(raw.load_bearing),
  };
}

/** Validity judge retention: composite >= 0.4 OR novelty >= 0.7 OR visibility is implicit */
export function passesValidityJudgeFilter(assumption: {
  compositeScore: number;
  novelty: number;
  visibility?: AssumptionVisibility;
}): boolean {
  if (assumption.visibility === "implicit") return true;
  if (assumption.compositeScore >= 0.4) return true;
  if (assumption.novelty >= 0.7) return true;
  return false;
}
