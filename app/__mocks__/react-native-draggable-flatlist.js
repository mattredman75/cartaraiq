// Mock react-native-draggable-flatlist
const React = require("react");

const DraggableFlatList = React.forwardRef(
  (
    {
      data,
      renderItem,
      keyExtractor,
      ListHeaderComponent,
      ListFooterComponent,
      ...props
    },
    ref,
  ) => {
    const Header = ListHeaderComponent;
    const Footer = ListFooterComponent;
    return React.createElement(
      "View",
      { ref, testID: "draggable-flat-list", ...props },
      Header
        ? typeof Header === "function"
          ? React.createElement(Header)
          : Header
        : null,
      data?.map((item, index) =>
        React.createElement(
          "View",
          { key: keyExtractor ? keyExtractor(item, index) : index },
          renderItem({
            item,
            drag: jest.fn(),
            isActive: false,
            getIndex: () => index,
          }),
        ),
      ),
      Footer
        ? typeof Footer === "function"
          ? React.createElement(Footer)
          : Footer
        : null,
    );
  },
);

DraggableFlatList.displayName = "DraggableFlatList";

module.exports = DraggableFlatList;
module.exports.default = DraggableFlatList;
