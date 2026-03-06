// ===============================================
// 🧠 MACRO SKILL ENGINE — STRATEGIC PROFILE
// ===============================================

export type MacroSkillProfile = {
  offensiveImpact: number;
  defensiveImpact: number;
  physicalCapacity: number;
  mentalStability: number;
  technicalControl: number;
  overallProfile: number;
};

export function buildMacroSkills(attributes: Record<string, number>): MacroSkillProfile {
  const safe = (value: number | undefined) => (typeof value === "number" ? value : 50);

  // =====================================
  // 🔥 OFFENSIVE IMPACT
  // =====================================

  const offensiveImpact =
    (safe(attributes.finishing) +
      safe(attributes.positioning) +
      safe(attributes.shotPower) +
      safe(attributes.longShots)) /
    4;

  // =====================================
  // 🛡 DEFENSIVE IMPACT
  // =====================================

  const defensiveImpact =
    (safe(attributes.marking) +
      safe(attributes.tackling) +
      safe(attributes.interceptions) +
      safe(attributes.aggression)) /
    4;

  // =====================================
  // 🏃 PHYSICAL CAPACITY
  // =====================================

  const physicalCapacity =
    (safe(attributes.strength) +
      safe(attributes.stamina) +
      safe(attributes.acceleration) +
      safe(attributes.sprintSpeed) +
      safe(attributes.jumping)) /
    5;

  // =====================================
  // 🧠 MENTAL STABILITY
  // =====================================

  const mentalStability =
    (safe(attributes.composure) +
      safe(attributes.vision) +
      safe(attributes.aggression) +
      safe(attributes.positioning)) /
    4;

  // =====================================
  // 🎯 TECHNICAL CONTROL
  // =====================================

  const technicalControl =
    (safe(attributes.dribbling) +
      safe(attributes.ballControl) +
      safe(attributes.shortPassing) +
      safe(attributes.longPassing)) /
    4;

  // =====================================
  // 🏆 OVERALL STRATEGIC PROFILE
  // =====================================

  const overallProfile =
    (offensiveImpact + defensiveImpact + physicalCapacity + mentalStability + technicalControl) / 5;

  return {
    offensiveImpact: Math.round(offensiveImpact),
    defensiveImpact: Math.round(defensiveImpact),
    physicalCapacity: Math.round(physicalCapacity),
    mentalStability: Math.round(mentalStability),
    technicalControl: Math.round(technicalControl),
    overallProfile: Math.round(overallProfile),
  };
}
