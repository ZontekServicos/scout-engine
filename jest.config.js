/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",

  // Allow tests to live in src/__tests__ OR tests/
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],

  // ts-jest config — use the test tsconfig
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },

  // Module path mapping mirrors tsconfig paths (if any)
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  // Clear mocks between tests automatically
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Show individual test names in output
  verbose: true,

  // Coverage
  collectCoverageFrom: [
    "src/integrations/sportmonks/**/*.ts",
    "src/ingestion/**/*.ts",
    "!**/*.d.ts",
  ],
  coverageThreshold: {
    global: { lines: 70 },
  },
  coverageDirectory: "coverage",

  // Increase timeout for async tests (API simulation)
  testTimeout: 15_000,

  // Setup file runs before each test file
};
