// ===============================================
// 🏆 ELITE SKILL TREE (FIFA-LIKE STRUCTURE)
// ===============================================

export type EliteCategoryIndex = {
  attacking: number;
  skill: number;
  movement: number;
  power: number;
  mentality: number;
  defending: number;
};

export type EliteSkillTree = {
  categoryIndex: EliteCategoryIndex;
  attributes: {
    attacking: {
      finishing: number;
      shotPower: number;
      longShots: number;
      positioning: number;
    };
    skill: {
      dribbling: number;
      ballControl: number;
      shortPassing: number;
      longPassing: number;
    };
    movement: {
      acceleration: number;
      sprintSpeed: number;
      agility: number;
      balance: number;
    };
    power: {
      strength: number;
      stamina: number;
      jumping: number;
    };
    mentality: {
      composure: number;
      aggression: number;
      vision: number;
    };
    defending: {
      marking: number;
      tackling: number;
      interceptions: number;
    };
  };
};

// ===============================================
// 🔧 BUILD FUNCTION
// ===============================================

export function buildEliteSkillTree(attributes: Record<string, number>): EliteSkillTree {
  // Helper para evitar undefined
  const safe = (value: number | undefined) => (typeof value === "number" ? value : 50);

  // =====================================
  // 🎯 ATTACKING
  // =====================================

  const attackingAttributes = {
    finishing: safe(attributes.finishing),
    shotPower: safe(attributes.shotPower),
    longShots: safe(attributes.longShots),
    positioning: safe(attributes.positioning),
  };

  const attacking =
    (attackingAttributes.finishing +
      attackingAttributes.shotPower +
      attackingAttributes.longShots +
      attackingAttributes.positioning) /
    4;

  // =====================================
  // 🎯 SKILL
  // =====================================

  const skillAttributes = {
    dribbling: safe(attributes.dribbling),
    ballControl: safe(attributes.ballControl),
    shortPassing: safe(attributes.shortPassing),
    longPassing: safe(attributes.longPassing),
  };

  const skill =
    (skillAttributes.dribbling +
      skillAttributes.ballControl +
      skillAttributes.shortPassing +
      skillAttributes.longPassing) /
    4;

  // =====================================
  // 🎯 MOVEMENT
  // =====================================

  const movementAttributes = {
    acceleration: safe(attributes.acceleration),
    sprintSpeed: safe(attributes.sprintSpeed),
    agility: safe(attributes.agility),
    balance: safe(attributes.balance),
  };

  const movement =
    (movementAttributes.acceleration +
      movementAttributes.sprintSpeed +
      movementAttributes.agility +
      movementAttributes.balance) /
    4;

  // =====================================
  // 🎯 POWER
  // =====================================

  const powerAttributes = {
    strength: safe(attributes.strength),
    stamina: safe(attributes.stamina),
    jumping: safe(attributes.jumping),
  };

  const power = (powerAttributes.strength + powerAttributes.stamina + powerAttributes.jumping) / 3;

  // =====================================
  // 🎯 MENTALITY
  // =====================================

  const mentalityAttributes = {
    composure: safe(attributes.composure),
    aggression: safe(attributes.aggression),
    vision: safe(attributes.vision),
  };

  const mentality =
    (mentalityAttributes.composure + mentalityAttributes.aggression + mentalityAttributes.vision) /
    3;

  // =====================================
  // 🎯 DEFENDING
  // =====================================

  const defendingAttributes = {
    marking: safe(attributes.marking),
    tackling: safe(attributes.tackling),
    interceptions: safe(attributes.interceptions),
  };

  const defending =
    (defendingAttributes.marking +
      defendingAttributes.tackling +
      defendingAttributes.interceptions) /
    3;

  return {
    categoryIndex: {
      attacking: Math.round(attacking),
      skill: Math.round(skill),
      movement: Math.round(movement),
      power: Math.round(power),
      mentality: Math.round(mentality),
      defending: Math.round(defending),
    },
    attributes: {
      attacking: attackingAttributes,
      skill: skillAttributes,
      movement: movementAttributes,
      power: powerAttributes,
      mentality: mentalityAttributes,
      defending: defendingAttributes,
    },
  };
}
