module.exports = {
  globals: {
    'ts-jest': {
      useBabelrc: true,
    },
  },
  transform: {
    '^.+\\.tsx?$': '<rootDir>/node_modules/ts-jest/preprocessor.js',
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  collectCoverage: Boolean(process.env.MAP_COVERAGE || process.env.CI),
  collectCoverageFrom: ['src/**/*', '!**/*.d.ts', '!**/node_modules/**'],
};
