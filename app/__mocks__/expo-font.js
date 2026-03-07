// Mock expo-font
module.exports = {
  useFonts: jest.fn(() => [true]),
  loadAsync: jest.fn().mockResolvedValue(true),
};
