export type Packet = { id: string; scenario: string; valid: boolean; attempts: number; deterministic: boolean };
export type Judgment = { id: string; violations: string[]; severe: boolean; effective: boolean; previousCorrect: boolean; repeated: boolean; unsure: boolean; reason: string };
export function scorePackets(packets: Packet[], judgments: Judgment[]) {
  const ids = new Set(packets.map(p => p.id));
  if (!packets.length || ids.size !== packets.length || judgments.length !== ids.size || new Set(judgments.map(j => j.id)).size !== ids.size || judgments.some(j => !ids.has(j.id))) throw new Error("Missing, duplicate or unexpected judgments");
  const rows = packets.map(p => ({ ...p, judgment: judgments.find(j => j.id === p.id)! }));
  const summarize = (items: typeof rows) => {
    const correct = items.filter(r => r.judgment.previousCorrect);
    // Legacy local-v1 field includes uncertainty; retain it for historical comparisons.
    const severe = items.filter(r => r.judgment.severe || r.judgment.unsure).length;
    const confirmedSevere = items.filter(r => r.judgment.severe).length;
    const unsureIds = items.filter(r => r.judgment.unsure).map(r => r.id);
    const violationsByGuideline = Object.fromEntries(["G1", "G2", "G3", "G4", "G5", "G6"].map(guideline => {
      const count = items.filter(r => r.judgment.violations.includes(guideline)).length;
      return [guideline, { count, denominator: items.length, rate: items.length ? count / items.length : null }];
    }));
    const effective = items.filter(r => r.valid && r.judgment.effective && !r.judgment.unsure).length;
    const repeated = correct.filter(r => r.judgment.repeated).length;
    return { count: items.length, severe, confirmedSevere, unsureCount: unsureIds.length, unsureIds, violationsByGuideline, violations: items.filter(r => r.judgment.violations.length || r.judgment.unsure).length, effectiveRate: items.length ? effective / items.length : null, repeatedDenominator: correct.length, repeatedRate: correct.length ? repeated / correct.length : null, firstValidRate: items.length ? items.filter(r => r.valid && r.attempts === 1).length / items.length : null, retryRate: items.length ? items.filter(r => r.attempts > 1).length / items.length : null, deterministic: items.every(r => r.deterministic) };
  };
  const overall = summarize(rows), byScenario = Object.fromEntries([...new Set(rows.map(r => r.scenario))].map(s => [s, summarize(rows.filter(r => r.scenario === s))]));
  const checks = {
    deterministic: overall.deterministic,
    confirmedSevereZero: overall.confirmedSevere === 0,
    overallEffectiveAtLeast90Percent: overall.effectiveRate !== null && overall.effectiveRate >= .9,
    repeatedAtMost5Percent: overall.repeatedRate !== null && overall.repeatedRate <= .05,
  };
  const numericalThresholdsMet = Object.values(checks).every(Boolean);
  const needsReview = overall.unsureCount > 0;
  const designGateMapping = {
    policy: "design-12.3-post-hoc-mapping" as const,
    note: "Post-hoc contract mapping only; not preregistered acceptance or formal reviewer sign-off. Uncertainty requires review. Per-scenario rates remain reported; the local-frozen-v1 gate is unchanged.",
    establishesFormalAcceptance: false as const,
    checks,
    numericalThresholdsMet,
    needsReview,
    eligibleForFormalReview: numericalThresholdsMet && !needsReview,
  };
  return { policy: "local-frozen-v1" as const, overall, byScenario, designGateMapping, passed: overall.deterministic && overall.severe === 0 && overall.effectiveRate! >= .9 && overall.repeatedRate !== null && overall.repeatedRate <= .05 && Object.values(byScenario).every(s => s.effectiveRate !== null && s.effectiveRate >= .9) };
}
