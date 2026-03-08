import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const TEAL = "#1B6B7A";
const MUTED = "#94A3B8";

function TabIcon({
  iconName,
  label,
  focused,
}: {
  iconName: string;
  label: string;
  focused: boolean;
}) {
  return (
    <View style={{ alignItems: "center", paddingTop: 6, width: 80 }}>
      <Ionicons
        name={iconName as any}
        size={24}
        color={focused ? TEAL : MUTED}
      />
      <Text
        numberOfLines={1}
        style={{
          fontSize: 10,
          marginTop: 3,
          fontWeight: focused ? "600" : "500",
          color: focused ? TEAL : MUTED,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TEAL,
        tabBarInactiveTintColor: MUTED,
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: "#E8EFF2",
          borderTopWidth: 1,
          paddingBottom: 8,
          height: 70,
        },
      }}
    >
      <Tabs.Screen
        name="list"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon iconName="list" label="Lists" focused={focused} />
          ),
          title: "Lists",
        }}
      />
      <Tabs.Screen
        name="pantry"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon iconName="albums" label="Pantry" focused={focused} />
          ),
          title: "Pantry",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon iconName="settings" label="Settings" focused={focused} />
          ),
          title: "Settings",
        }}
      />
      <Tabs.Screen name="products/index" options={{ href: null }} />
      <Tabs.Screen name="products/[id]" options={{ href: null }} />
      <Tabs.Screen name="manage-data" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
