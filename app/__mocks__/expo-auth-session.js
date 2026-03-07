// Mock expo-auth-session
const useAutoDiscovery = jest.fn(() => ({
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
}));

const useAuthRequest = jest.fn(() => [
  { codeVerifier: "mock-code-verifier" }, // request
  null, // response
  jest
    .fn()
    .mockResolvedValue({ type: "success", params: { code: "mock-code" } }), // promptAsync
]);

const makeRedirectUri = jest.fn(() => "cartaraiq://redirect");

module.exports = {
  useAutoDiscovery,
  useAuthRequest,
  makeRedirectUri,
  ResponseType: {
    Code: "code",
    Token: "token",
  },
};
