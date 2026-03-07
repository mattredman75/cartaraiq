// Mock expo-crypto
module.exports = {
  digestStringAsync: jest.fn().mockResolvedValue("mocked-hash-value"),
  getRandomBytes: jest.fn(() => new Uint8Array(32)),
  CryptoDigestAlgorithm: {
    SHA256: "SHA-256",
    SHA512: "SHA-512",
    MD5: "MD5",
  },
};
