// Mock expo-linking
module.exports = {
  createURL: jest.fn((path) => `cartaraiq://${path}`),
  parse: jest.fn((url) => ({ path: url })),
};
