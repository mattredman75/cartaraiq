// Mock expo-notifications
const addNotificationReceivedListener = jest.fn(() => ({ remove: jest.fn() }));
const addNotificationResponseReceivedListener = jest.fn(() => ({
  remove: jest.fn(),
}));
const getPermissionsAsync = jest.fn().mockResolvedValue({ status: "granted" });
const requestPermissionsAsync = jest
  .fn()
  .mockResolvedValue({ status: "granted" });
const getExpoPushTokenAsync = jest
  .fn()
  .mockResolvedValue({ data: "ExponentPushToken[mock]" });
const setNotificationHandler = jest.fn();
const setNotificationChannelAsync = jest.fn().mockResolvedValue(undefined);

module.exports = {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getPermissionsAsync,
  requestPermissionsAsync,
  getExpoPushTokenAsync,
  setNotificationHandler,
  setNotificationChannelAsync,
  AndroidImportance: {
    DEFAULT: 3,
    HIGH: 4,
  },
};
