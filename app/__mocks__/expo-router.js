// Mock expo-router
const useRouter = jest.fn(() => ({
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
}));

const useSegments = jest.fn(() => []);
const useLocalSearchParams = jest.fn(() => ({}));

const Slot = () => null;
const Redirect = () => null;
const Stack = () => null;
Stack.Screen = () => null;

module.exports = {
  useRouter,
  useSegments,
  useLocalSearchParams,
  Slot,
  Redirect,
  Stack,
};
