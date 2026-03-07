// Mock react-native-reanimated
const React = require("react");

const AnimatedView = React.forwardRef((props, ref) =>
  React.createElement("View", { ...props, ref }),
);
AnimatedView.displayName = "Reanimated.View";

const AnimatedText = React.forwardRef((props, ref) =>
  React.createElement("Text", { ...props, ref }),
);
AnimatedText.displayName = "Reanimated.Text";

const AnimatedImage = React.forwardRef((props, ref) =>
  React.createElement("Image", { ...props, ref }),
);
AnimatedImage.displayName = "Reanimated.Image";

const AnimatedScrollView = React.forwardRef((props, ref) =>
  React.createElement("ScrollView", { ...props, ref }),
);
AnimatedScrollView.displayName = "Reanimated.ScrollView";

const Reanimated = {
  default: {
    createAnimatedComponent: (component) => component,
    View: AnimatedView,
    Text: AnimatedText,
    Image: AnimatedImage,
    ScrollView: AnimatedScrollView,
  },
  useSharedValue: jest.fn((init) => ({ value: init })),
  useAnimatedStyle: jest.fn((styleFactory) => {
    try {
      return styleFactory();
    } catch {
      return {};
    }
  }),
  withSpring: jest.fn((val) => val),
  withTiming: jest.fn((val, _config, callback) => {
    if (callback) callback(true);
    return val;
  }),
  withDelay: jest.fn((_delay, val) => val),
  withSequence: jest.fn((...vals) => vals[vals.length - 1]),
  withRepeat: jest.fn((val) => val),
  runOnJS: jest.fn((fn) => fn),
  Easing: {
    linear: jest.fn(),
    ease: jest.fn(),
    in: jest.fn(() => jest.fn()),
    out: jest.fn(() => jest.fn()),
    inOut: jest.fn(() => jest.fn()),
    back: jest.fn(() => jest.fn()),
    cubic: jest.fn(),
  },
  interpolate: jest.fn((val) => val),
  Extrapolation: { CLAMP: "clamp" },
};

module.exports = Reanimated;
module.exports.__esModule = true;
module.exports.default = Reanimated.default;
