// Mock expo-file-system/legacy
module.exports = {
  cacheDirectory: "/mock-cache/",
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  EncodingType: {
    UTF8: "utf8",
    Base64: "base64",
  },
};
