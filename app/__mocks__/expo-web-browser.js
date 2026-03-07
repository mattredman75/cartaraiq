// Mock expo-web-browser
module.exports = {
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn().mockResolvedValue({ type: "cancel" }),
  openBrowserAsync: jest.fn().mockResolvedValue({ type: "cancel" }),
};
