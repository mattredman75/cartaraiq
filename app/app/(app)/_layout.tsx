import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 6, width: 64 }}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      <Text
        numberOfLines={1}
        style={{
          fontSize: 10,
          marginTop: 2,
          fontWeight: focused ? '700' : '500',
          color: focused ? '#1B6B7A' : '#94A3B8',
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
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen
        name="list"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="🛒" label="My List" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="products/index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔍" label="Discover" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="products/[id]"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" label="Profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
