const React = require("react");
const { View } = require("react-native");

const mock = (name) => {
  const Component = ({ children, ...props }) =>
    React.createElement(View, { testID: name, ...props }, children);
  Component.displayName = name;
  return Component;
};

module.exports = {
  SvgXml: mock("SvgXml"),
  Svg: mock("Svg"),
  Rect: mock("Rect"),
  Circle: mock("Circle"),
  Text: mock("Text"),
  Path: mock("Path"),
  G: mock("G"),
  Line: mock("Line"),
  Polygon: mock("Polygon"),
  Polyline: mock("Polyline"),
  Ellipse: mock("Ellipse"),
  default: mock("Svg"),
};
