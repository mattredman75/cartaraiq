const React = require("react");
const { View } = require("react-native");

const Camera = {
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  getCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
};

const CameraView = jest.fn(({ children }) => React.createElement(View, { testID: "camera-view" }, children));

module.exports = { Camera, CameraView };
