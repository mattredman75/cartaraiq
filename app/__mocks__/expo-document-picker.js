// Mock expo-document-picker
module.exports = {
  getDocumentAsync: jest.fn().mockResolvedValue({ canceled: true }),
};
