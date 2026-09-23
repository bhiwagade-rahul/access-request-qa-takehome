module.exports = {
  preset: 'ts-jest',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/jest.setup.ts'],
  maxWorkers: 1,
  testTimeout: 10_000,
  reporters: ['default', ['jest-junit', { outputDirectory: 'reports/latest', outputName: 'junit.xml' }]]
};
