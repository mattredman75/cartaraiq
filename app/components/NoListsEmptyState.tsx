import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';

const TEAL = '#1B6B7A';
const TEXT = '#1A1A2E';
const MUTED = '#64748B';
const BORDER = '#E8EFF2';
const CARD = '#FFFFFF';
const BG = '#F5F9FA';

export function NoListsEmptyState({
  onCreateList, isPending, newListName, onChangeName,
}: {
  onCreateList: (name: string) => void;
  isPending: boolean;
  newListName: string;
  onChangeName: (v: string) => void;
}) {
  const handleSubmit = () => {
    const name = newListName.trim();
    if (name) onCreateList(name);
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
      <Text style={{ fontSize: 64, marginBottom: 20 }}>📋</Text>
      <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT, marginBottom: 8, textAlign: 'center' }}>
        No lists yet
      </Text>
      <Text style={{ fontSize: 15, color: MUTED, textAlign: 'center', marginBottom: 36, lineHeight: 22 }}>
        Create your first list to start tracking what you need.
      </Text>
      <View style={{
        flexDirection: 'row',
        backgroundColor: CARD,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: BORDER,
        width: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
      }}>
        <TextInput
          value={newListName}
          onChangeText={onChangeName}
          onSubmitEditing={handleSubmit}
          placeholder="Name your list…"
          placeholderTextColor={MUTED}
          returnKeyType="done"
          autoFocus
          style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 16, fontSize: 15, color: TEXT }}
        />
        <TouchableOpacity
          onPress={handleSubmit}
          style={{ backgroundColor: TEAL, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' }}
        >
          {isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>+</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
