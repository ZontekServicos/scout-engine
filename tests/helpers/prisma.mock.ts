/**
 * tests/helpers/prisma.mock.ts
 *
 * Type-safe Prisma mock that can be reset between tests.
 * Import `prismaMock` in tests and configure individual methods.
 *
 * Usage:
 *   jest.mock('../../src/lib/prisma', () => ({ prisma: prismaMock }));
 *   prismaMock.match.upsert.mockResolvedValue(dbMatch);
 */

import { jest } from "@jest/globals";

const makeModel = () => ({
  upsert:       jest.fn(),
  create:       jest.fn(),
  createMany:   jest.fn(),
  update:       jest.fn(),
  updateMany:   jest.fn(),
  delete:       jest.fn(),
  findUnique:   jest.fn(),
  findFirst:    jest.fn(),
  findMany:     jest.fn(),
  count:        jest.fn(),
});

export const prismaMock = {
  country:            makeModel(),
  league:             makeModel(),
  season:             makeModel(),
  team:               makeModel(),
  player:             makeModel(),
  match:              makeModel(),
  matchEvent:         makeModel(),
  playerStats:        makeModel(),
  ingestionCheckpoint: makeModel(),
  $transaction:       jest.fn(),
  $disconnect:        jest.fn(),
};

/** Reset all mock calls and return values between tests. */
export function resetPrismaMock() {
  for (const model of Object.values(prismaMock)) {
    if (typeof model === "object" && model !== null) {
      for (const fn of Object.values(model)) {
        if (typeof fn === "function" && "mockReset" in fn) {
          (fn as ReturnType<typeof jest.fn>).mockReset();
        }
      }
    }
  }
}
