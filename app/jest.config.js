/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@tanstack/react-query|zustand|nativewind|react-native-reanimated|react-native-gesture-handler|react-native-draggable-flatlist|react-native-safe-area-context|react-native-screens|expo-speech-recognition)",
  ],
  setupFilesAfterEnv: ["./jest.setup.js"],

  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@react-native-async-storage/async-storage$": "@react-native-async-storage/async-storage/jest/async-storage-mock",
    "\\.(png|jpg|jpeg|gif|svg)$": "<rootDir>/__mocks__/fileMock.js",
    "\\.(css)$": "<rootDir>/__mocks__/cssMock.js",
    "^expo-camera$": "<rootDir>/__mocks__/expo-camera.js",
    "^react-native-svg$": "<rootDir>/__mocks__/react-native-svg.js",
  },
  collectCoverageFrom: [
    "lib/**/*.{ts,tsx}",
    "hooks/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "app/**/*.{ts,tsx}",
    "App.tsx",
    "!index.ts",
    "!lib/types.ts",
    "!**/*.d.ts",
    "!**/node_modules/**",
    "!app/**/inspiration.tsx",
    "!hooks/useLoyaltyPrograms.ts",
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};
