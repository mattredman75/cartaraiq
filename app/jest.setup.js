// Jest setup for React Native / Expo test suite
require("@testing-library/jest-native/extend-expect");

// Silence noisy console output during tests
jest.spyOn(console, "warn").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});
jest.spyOn(console, "log").mockImplementation(() => {});
