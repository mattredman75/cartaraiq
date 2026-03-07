// Mock react-native-gesture-handler with callback capture
const React = require("react");

const GestureDetector = ({ children }) => children;
const GestureHandlerRootView = ({ children }) =>
  React.createElement("View", { testID: "gesture-root" }, children);

// Store last gesture callbacks for testing
const __gestureCallbacks = { onUpdate: null, onEnd: null };

const Gesture = {
  Pan: jest.fn(() => {
    const self = {};
    self.activeOffsetX = jest.fn().mockReturnValue(self);
    self.failOffsetY = jest.fn().mockReturnValue(self);
    self.enabled = jest.fn().mockReturnValue(self);
    self.onUpdate = jest.fn((cb) => {
      __gestureCallbacks.onUpdate = cb;
      return self;
    });
    self.onEnd = jest.fn((cb) => {
      __gestureCallbacks.onEnd = cb;
      return self;
    });
    return self;
  }),
  Tap: jest.fn(() => {
    const tap = {};
    tap.onEnd = jest.fn().mockReturnValue(tap);
    return tap;
  }),
};

module.exports = {
  GestureDetector,
  GestureHandlerRootView,
  Gesture,
  __gestureCallbacks,
  Swipeable: ({ children }) => children,
  DrawerLayout: ({ children }) => children,
  State: {},
  PanGestureHandler: ({ children }) => children,
  TapGestureHandler: ({ children }) => children,
  FlingGestureHandler: ({ children }) => children,
  LongPressGestureHandler: ({ children }) => children,
  ScrollView: ({ children }) =>
    React.createElement("ScrollView", null, children),
  FlatList: ({ children }) => React.createElement("FlatList", null, children),
};
