// Mock expo-speech-recognition
module.exports = {
  ExpoSpeechRecognitionModule: {
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  },
  useSpeechRecognitionEvent: jest.fn(),
};
