import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
} from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../lib/store";
import { updateMe } from "../lib/api";
import { setItem, deleteItem } from "../lib/storage";

const TEAL = "#1B6B7A";
const TEAL_DARK = "#0D4F5C";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  aiEnabled: boolean;
  setAiEnabled: (v: boolean) => void;
  pairingEnabled: boolean;
  setPairingEnabled: (v: boolean) => void;
}

export function SettingsModal({
  visible,
  onClose,
  aiEnabled,
  setAiEnabled,
  pairingEnabled,
  setPairingEnabled,
}: SettingsModalProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, clearAuth, updateUser } = useAuthStore();

  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameText, setDisplayNameText] = useState("");

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose}>
        <View
          style={{
            position: "absolute",
            top: insets.top + 56,
            right: 16,
            width: 300,
            backgroundColor: "#fff",
            borderRadius: 16,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 16,
            elevation: 12,
            overflow: "hidden",
          }}
        >
          {/* User info */}
          <View
            style={{
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: BORDER,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: TEAL_DARK,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 8,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                {user?.name?.charAt(0).toUpperCase() ?? "?"}
              </Text>
            </View>
            {editingDisplayName ? (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <TextInput
                  value={displayNameText}
                  onChangeText={setDisplayNameText}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={async () => {
                    const name = displayNameText.trim();
                    if (name && name !== user?.name) {
                      await updateMe(name);
                      updateUser({ name });
                      await setItem(
                        "auth_user",
                        JSON.stringify({ ...user, name }),
                      );
                    }
                    setEditingDisplayName(false);
                  }}
                  style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: "700",
                    color: TEXT,
                    borderBottomWidth: 1.5,
                    borderBottomColor: TEAL,
                    paddingVertical: 2,
                  }}
                />
                <TouchableOpacity
                  onPress={async () => {
                    const name = displayNameText.trim();
                    if (name && name !== user?.name) {
                      await updateMe(name);
                      updateUser({ name });
                      await setItem(
                        "auth_user",
                        JSON.stringify({ ...user, name }),
                      );
                    }
                    setEditingDisplayName(false);
                  }}
                >
                  <Text
                    style={{ color: TEAL, fontWeight: "700", fontSize: 13 }}
                  >
                    Save
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  setDisplayNameText(user?.name ?? "");
                  setEditingDisplayName(true);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: TEXT }}>
                  {user?.name ?? "User"}
                </Text>
                <Text style={{ fontSize: 11, color: MUTED }}>✎</Text>
              </TouchableOpacity>
            )}
            <Text style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>
              {user?.email ?? ""}
            </Text>
          </View>

          {/* AI suggestions toggle */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: BORDER,
            }}
          >
            <Text style={{ fontSize: 14, color: TEXT, fontWeight: "500" }}>
              AI Suggestions
            </Text>
            <Switch
              value={aiEnabled}
              onValueChange={(val) => {
                setAiEnabled(val);
                setItem("ai_suggestions_enabled", val ? "1" : "0");
              }}
              trackColor={{ false: BORDER, true: TEAL }}
              thumbColor="#fff"
            />
          </View>

          {/* Pairing suggestions toggle */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: BORDER,
              opacity: aiEnabled ? 1 : 0.4,
            }}
          >
            <View>
              <Text style={{ fontSize: 14, color: TEXT, fontWeight: "500" }}>
                Pairing Suggestions
              </Text>
              <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
                Ingredients that pair with your list
              </Text>
            </View>
            <Switch
              value={pairingEnabled && aiEnabled}
              disabled={!aiEnabled}
              onValueChange={(val) => {
                setPairingEnabled(val);
                setItem("pairing_suggestions_enabled", val ? "1" : "0");
              }}
              trackColor={{ false: BORDER, true: TEAL }}
              thumbColor="#fff"
            />
          </View>

          {/* Version */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: BORDER,
            }}
          >
            {(() => {
              const version = Constants.expoConfig?.version ?? "1.0.0";
              let build: string | null =
                Constants.expoConfig?.ios?.buildNumber ||
                (Constants.expoConfig?.android?.versionCode
                  ? String(Constants.expoConfig?.android?.versionCode)
                  : null) ||
                null;

              // try to read generated build-info with git commit
              try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const info = require("../build-info.json");
                if (info && info.gitCommit) {
                  const hash = String(info.gitCommit).slice(0, 10);
                  build = build ? `${build}.${hash}` : hash;
                }
              } catch (e) {
                // file may not exist in some environments; ignore
              }

              return (
                <Text style={{ fontSize: 12, color: MUTED }}>
                  Version {version}
                  {build ? ` (${build})` : ""}
                </Text>
              );
            })()}
          </View>

          {/* Sign out */}
          <TouchableOpacity
            onPress={async () => {
              onClose();
              await deleteItem("auth_token");
              await deleteItem("auth_user");
              clearAuth();
              router.replace("/(auth)/welcome" as any);
            }}
            style={{ paddingHorizontal: 16, paddingVertical: 14 }}
          >
            <Text style={{ fontSize: 14, color: "#EF4444", fontWeight: "600" }}>
              Sign out
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
