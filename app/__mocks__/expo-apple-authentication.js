// Mock expo-apple-authentication
module.exports = {
  signInAsync: jest.fn().mockResolvedValue({
    identityToken: "mock-apple-token",
    fullName: { givenName: "John", familyName: "Doe" },
  }),
  AppleAuthenticationScope: {
    FULL_NAME: 0,
    EMAIL: 1,
  },
};
