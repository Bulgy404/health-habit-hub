import type { Config } from "jest";

const config: Config = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jsdom",
  moduleNameMapper: {
    // Stub CSS modules — must come before the "@/" alias mapper below, or a
    // "@/foo/bar.module.css" import matches the alias pattern first and
    // resolves to the real CSS file (which babel-jest can't parse as JS).
    "\\.module\\.css$": "<rootDir>/src/__tests__/__mocks__/styleMock.ts",
    "^@/(.*)$": "<rootDir>/src/$1",
    // next-intl ships ESM-only builds Jest's default transform can't parse;
    // this mock does real key lookup against messages/en.json instead.
    "^next-intl$": "<rootDir>/src/__tests__/__mocks__/next-intl.tsx",
    "^next-intl/server$": "<rootDir>/src/__tests__/__mocks__/next-intl.tsx",
  },
  transform: {
    "^.+\\.(ts|tsx|js|jsx)$": [
      "babel-jest",
      {
        presets: [
          ["@babel/preset-env", { targets: { node: "current" } }],
          ["@babel/preset-react", { runtime: "automatic" }],
          "@babel/preset-typescript",
        ],
      },
    ],
  },
  testMatch: ["**/__tests__/**/*.test.{ts,tsx}"],
  // Don't transform node_modules except for specific ESM packages
  transformIgnorePatterns: ["/node_modules/"],
};

export default config;
