/**
 * Tests for index.ts (entry point)
 * index.ts simply imports 'expo-router/entry' — verify the module exists.
 */

jest.mock("expo-router/entry", () => ({}));

describe("index.ts", () => {
  it("imports without error", () => {
    expect(() => {
      jest.isolateModules(() => {
        require("../index");
      });
    }).not.toThrow();
  });
});
