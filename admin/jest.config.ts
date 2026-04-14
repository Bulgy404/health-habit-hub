import type { Config } from 'jest';

const config: Config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Stub CSS modules
    '\\.module\\.css$': '<rootDir>/src/__tests__/__mocks__/styleMock.ts',
  },
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          ['@babel/preset-react', { runtime: 'automatic' }],
          '@babel/preset-typescript',
        ],
      },
    ],
  },
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  // Don't transform node_modules except for specific ESM packages
  transformIgnorePatterns: ['/node_modules/'],
};

export default config;
