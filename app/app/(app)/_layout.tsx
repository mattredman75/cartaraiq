import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const TEAL = "#1B6B7A";
const TEAL_MID = "#2A8A9A";
const INACTIVE = "rgba(255,255,255,0.55)";

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
    <View style={{ alignItems: "center", paddingTop: 14, width: 90 }}>
      <Ionicons
        name={iconName as any}
        size={28}
        color={focused ? "#FFFFFF" : INACTIVE}
      />
      <Text
        numberOfLines={1}
        style={{
          fontSize: 12,
          marginTop: 4,
          fontWeight: focused ? "700" : "500",
          color: focused ? "#FFFFFF" : INACTIVE,
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
        tabBarActiveTintColor: TEAL_MID,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: TEAL,
          borderTopColor: "#0D4F5C",
          borderTopWidth: 1,
          paddingBottom: 8,
          height: 75,
        },
      }}
    >
      <Tabs.Screen
        name="list"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon iconName="list" label="Lists" focused={focused} />
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="pantry"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon iconName="card" label="Cards" focused={focused} />
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="inspiration"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon iconName="sparkles" label="Inspiration" focused={focused} />
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon iconName="settings" label="Settings" focused={focused} />
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen name="products/index" options={{ href: null }} />
      <Tabs.Screen name="products/[id]" options={{ href: null }} />
      <Tabs.Screen name="manage-data" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
