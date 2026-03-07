// Mock react-native-safe-area-context
const React = require("react");

const SafeAreaProvider = ({ children }) =>
  React.createElement("View", { testID: "safe-area-provider" }, children);

const SafeAreaView = React.forwardRef(({ children, ...props }, ref) =>
  React.createElement(
    "View",
    { ...props, ref, testID: "safe-area-view" },
    children,
  ),
);

const useSafeAreaInsets = jest.fn(() => ({
  top: 44,
  bottom: 34,
  left: 0,
  right: 0,
}));

module.exports = {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
};
