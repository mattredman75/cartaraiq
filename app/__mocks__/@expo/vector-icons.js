// Mock @expo/vector-icons
const React = require("react");

const createIconMock = (name) => {
  const IconComponent = (props) =>
    React.createElement("Text", props, props.name || name);
  IconComponent.displayName = name;
  return IconComponent;
};

module.exports = {
  Ionicons: createIconMock("Ionicons"),
  MaterialIcons: createIconMock("MaterialIcons"),
  FontAwesome: createIconMock("FontAwesome"),
};
