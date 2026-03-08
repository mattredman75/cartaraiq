import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { deleteItem } from '../../lib/storage';
import { useAuthStore } from '../../lib/store';
import { COLORS } from '../../lib/constants';
import { useState } from 'react';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [notifications, setNotifications] = useState(true);
  const [aiSuggestions, setAiSuggestions] = useState(true);

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            const { authLogout } = await import('../../lib/api');
            await authLogout();
          } catch (_) { /* best-effort */ }
          await deleteItem('auth_token');
          await deleteItem('refresh_token');
          await deleteItem('auth_user');
          clearAuth();
        },
      },
    ]);
  };

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '??';

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 28 }}>
            <Text
              style={{
                fontFamily: 'Montserrat_700Bold',
                fontSize: 28,
                color: COLORS.ink,
              }}
            >
              Profile
            </Text>
          </View>

          {/* Avatar + name card */}
          <View
            style={{
              marginHorizontal: 24,
              backgroundColor: COLORS.tealDark,
              borderRadius: 24,
              padding: 24,
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 28,
            }}
          >
            {/* Avatar */}
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                backgroundColor: COLORS.cyan + '30',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 18,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Montserrat_700Bold',
                  fontSize: 22,
                  color: COLORS.cyan,
                }}
              >
                {initials}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: 'Montserrat_700Bold',
                  fontSize: 18,
                  color: '#fff',
                  marginBottom: 4,
                }}
              >
                {user?.name ?? 'User'}
              </Text>
              <Text
                style={{
                  fontFamily: 'Montserrat_400Regular',
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                {user?.email ?? ''}
              </Text>
            </View>
          </View>

          {/* Preferences */}
          <SectionHeader label="PREFERENCES" />

          <SettingsCard>
            <SettingRow
              label="SMART Suggestions"
              subtitle="Show predictive items on your list"
              value={aiSuggestions}
              onToggle={setAiSuggestions}
              divider
            />
            <SettingRow
              label="Notifications"
              subtitle="Reminders when items are due"
              value={notifications}
              onToggle={setNotifications}
            />
          </SettingsCard>

          {/* About */}
          <SectionHeader label="ABOUT" />

          <SettingsCard>
            <InfoRow label="Version" value="1.0.0" divider />
            <InfoRow label="Powered by" value="Claude AI" />
          </SettingsCard>

          {/* Sign out */}
          <View style={{ marginHorizontal: 24, marginTop: 32 }}>
            <TouchableOpacity
              onPress={handleSignOut}
              activeOpacity={0.85}
              style={{
                backgroundColor: COLORS.danger,
                borderRadius: 16,
                paddingVertical: 18,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: 'Montserrat_700Bold',
                  fontSize: 16,
                  color: '#ffffff',
                  letterSpacing: 0.3,
                }}
              >
                Sign Out
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <Text
      style={{
        fontFamily: 'Montserrat_600SemiBold',
        fontSize: 12,
        color: COLORS.muted,
        letterSpacing: 0.8,
        paddingHorizontal: 24,
        marginBottom: 10,
        marginTop: 4,
      }}
    >
      {label}
    </Text>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        marginHorizontal: 24,
        backgroundColor: COLORS.card,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        marginBottom: 20,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function SettingRow({
  label,
  subtitle,
  value,
  onToggle,
  divider,
}: {
  label: string;
  subtitle: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  divider?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 16,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: COLORS.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: 'Montserrat_500Medium',
            fontSize: 15,
            color: COLORS.ink,
            marginBottom: 2,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: 'Montserrat_400Regular',
            fontSize: 12,
            color: COLORS.muted,
          }}
        >
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.border, true: COLORS.teal }}
        thumbColor="#fff"
      />
    </View>
  );
}

function InfoRow({
  label,
  value,
  divider,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 16,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: COLORS.border,
      }}
    >
      <Text
        style={{
          fontFamily: 'Montserrat_500Medium',
          fontSize: 15,
          color: COLORS.ink,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: 'Montserrat_400Regular',
          fontSize: 14,
          color: COLORS.muted,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
