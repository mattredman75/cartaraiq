import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TEAL = '#1B6B7A';
const BG = '#DDE4E7';
const MUTED = '#64748B';

export default function PantryScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['right', 'left']}>
      <View style={styles.content}>
        <Text style={styles.icon}>📚</Text>
        <Text style={styles.title}>Pantry</Text>
        <Text style={styles.subtitle}>Coming soon</Text>
        <Text style={styles.description}>
          Track ingredients you have at home and manage your kitchen inventory.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: TEAL,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '500',
    color: MUTED,
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
});
