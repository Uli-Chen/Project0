export type OriginalFreshness = "fresh" | "repeat" | "unknown";
export type ExposureFact = "none" | "known" | "unknown_time";

/** RFC §6: positive prior evidence wins over uncertain legacy exposure.
 * Quick assistance and merely starting another attempt do not consume freshness. */
export function originalFreshness(input: {
  rewrite: boolean; submitted: ExposureFact; feedback: ExposureFact; exposureUnknown: boolean;
}): OriginalFreshness {
  if (input.rewrite || input.submitted !== "none" || input.feedback !== "none") return "repeat";
  return input.exposureUnknown ? "unknown" : "fresh";
}
