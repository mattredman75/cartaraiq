import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  TouchableOpacity,
  Switch,
  SafeAreaView,
  ScrollView,
  Modal,
  Share,
  ActivityIndicator,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../../lib/store";
import {
  updateMe,
  setupBiometric,
  disableBiometric,
  authLogout,
  fetchShoppingLists,
  createListInvite,
  fetchListShares,
  removeListShare,
  leaveList,
  uploadAvatar,
  clearAvatar,
} from "../../lib/api";
import { setItem, deleteItem, getItem } from "../../lib/storage";
import { useBiometricAuth } from "../../hooks/useBiometricAuth";
import { PINEntry } from "../../components/PINEntry";
import type { ShoppingList } from "../../lib/types";

interface ShareEntry {
  id: number;
  shared_with_id: number | null;
  shared_with_name: string | null;
  shared_with_email: string | null;
  shared_with_avatar_url: string | null;
  status: "pending" | "accepted";
  created_at: string;
}

const TEAL = "#1B6B7A";
const TEAL_DARK = "#0D4F5C";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";
const BG = "#DDE4E7";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, clearAuth, updateUser } = useAuthStore();
  const {
    isBiometricAvailable,
    biometricType,
    checkBiometricAvailability,
    disableBiometricLogin,
    isBiometricEnabled,
    isPinEnabled,
    enablePin,
    disablePin,
    hashPin,
    getBiometricCredentials,
    authenticateWithBiometric,
    storeBiometricCredentials,
  } = useBiometricAuth();

  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameText, setDisplayNameText] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [pinEnabled, setPinEnabledState] = useState(false);
  const [showResetPINModal, setShowResetPINModal] = useState(false);
  const [resetPINStep, setResetPINStep] = useState<"first" | "confirm">(
    "first",
  );
  const [firstResetPIN, setFirstResetPIN] = useState("");
  const [resetPINError, setResetPINError] = useState("");
  const [showBiometricSuccessModal, setShowBiometricSuccessModal] =
    useState(false);
  const [showPinSuccessModal, setShowPinSuccessModal] = useState(false);
  const [showPinMismatchModal, setShowPinMismatchModal] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [pairingEnabled, setPairingEnabled] = useState(true);

  // Sharing state
  const [sharingLists, setSharingLists] = useState<ShoppingList[]>([]);
  const [shareDetails, setShareDetails] = useState<
    Record<number, ShareEntry[]>
  >({});
  const [sharingLoadingId, setSharingLoadingId] = useState<number | null>(null);
  const [expandedListId, setExpandedListId] = useState<number | null>(null);

  const loadSharingData = async () => {
    try {
      const res = await fetchShoppingLists();
      const lists: ShoppingList[] = res.data ?? [];
      setSharingLists(lists);
      // Load shares for any already-expanded list
      if (expandedListId) {
        const sharesRes = await fetchListShares(expandedListId);
        setShareDetails((prev) => ({
          ...prev,
          [expandedListId]: sharesRes.data ?? [],
        }));
      }
    } catch {
      // ignore
    }
  };

  const handleShareList = async (list: ShoppingList) => {
    setSharingLoadingId(list.id);
    try {
      const res = await createListInvite(list.id);
      const inviteUrl: string = res.data?.invite_url ?? "";
      await Share.share({
        message: `Join my "${list.name}" shopping list on CartaraIQ!\n${inviteUrl}`,
      });
    } catch {
      // user cancelled or error
    } finally {
      setSharingLoadingId(null);
      loadSharingData();
    }
  };

  const handleExpandList = async (listId: number) => {
    if (expandedListId === listId) {
      setExpandedListId(null);
      return;
    }
    setExpandedListId(listId);
    try {
      const res = await fetchListShares(listId);
      setShareDetails((prev) => ({ ...prev, [listId]: res.data ?? [] }));
    } catch {
      // ignore
    }
  };

  const handleRemoveShare = async (listId: number, shareId: number) => {
    try {
      await removeListShare(listId, shareId);
      setShareDetails((prev) => ({
        ...prev,
        [listId]: (prev[listId] ?? []).filter((s) => s.id !== shareId),
      }));
      // Refresh list to update share_count
      const res = await fetchShoppingLists();
      setSharingLists(res.data ?? []);
    } catch (e: any) {
      if (e?.response?.status === 404) {
        loadSharingData();
      } else {
        Alert.alert(
          "Error",
          "Could not remove collaborator. Please try again.",
        );
      }
    }
  };

  const handleLeaveList = (list: ShoppingList) => {
    Alert.alert(
      "Leave List",
      `Leave "${list.name}"? You will lose access and need a new invite to rejoin.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              await leaveList(list.id);
              setSharingLists((prev) => prev.filter((l) => l.id !== list.id));
            } catch (e: any) {
              if (e?.response?.status === 404) {
                loadSharingData();
              } else {
                Alert.alert(
                  "Error",
                  "Could not leave the list. Please try again.",
                );
              }
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    checkBiometricAvailability();
    isBiometricEnabled().then(setBiometricEnabled);
    isPinEnabled().then(setPinEnabledState);

    // Load avatar — prefer server URL stored on the user object, fall back to local cache
    const serverAvatar = user?.avatar_url;
    if (serverAvatar) {
      setAvatarUri(serverAvatar);
    } else {
      getItem("profile_avatar_uri").then((v) => {
        if (v) setAvatarUri(v);
      });
    }

    // Load feature flags — explicitly set both true and false so toggle renders correctly
    getItem("ai_suggestions_enabled").then((v) => setAiEnabled(v !== "0"));
    getItem("pairing_suggestions_enabled").then((v) =>
      setPairingEnabled(v !== "0"),
    );

    // Load sharing data
    loadSharingData();
  }, [checkBiometricAvailability, isBiometricEnabled, isPinEnabled]);

  // Refresh sharing data whenever this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadSharingData();
    }, []),
  );

  const handlePickPhoto = () => {
    Alert.alert("Profile Photo", "Choose an option", [
      {
        text: "Take Photo",
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            Alert.alert(
              "Permission required",
              "Camera access is needed to take a photo.",
            );
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]?.uri) {
            const uri = result.assets[0].uri;
            setAvatarUri(uri);
            await setItem("profile_avatar_uri", uri);
            try {
              const res = await uploadAvatar(uri);
              if (res.data?.avatar_url) {
                updateUser({ avatar_url: res.data.avatar_url });
                setAvatarUri(res.data.avatar_url);
              }
            } catch {
              // Upload failed — local preview still shown
            }
          }
        },
      },
      {
        text: "Choose from Library",
        onPress: async () => {
          const { status } =
            await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== "granted") {
            Alert.alert(
              "Permission required",
              "Photo library access is needed to choose a photo.",
            );
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]?.uri) {
            const uri = result.assets[0].uri;
            setAvatarUri(uri);
            await setItem("profile_avatar_uri", uri);
            try {
              const res = await uploadAvatar(uri);
              if (res.data?.avatar_url) {
                updateUser({ avatar_url: res.data.avatar_url });
                setAvatarUri(res.data.avatar_url);
              }
            } catch {
              // Upload failed — local preview still shown
            }
          }
        },
      },
      ...(avatarUri
        ? [
            {
              text: "Clear Photo",
              style: "destructive" as const,
              onPress: async () => {
                setAvatarUri(null);
                await deleteItem("profile_avatar_uri");
                updateUser({ avatar_url: null });
                try { await clearAvatar(); } catch { /* best-effort */ }
              },
            },
          ]
        : []),
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleFirstResetPIN = async (pin: string) => {
    setFirstResetPIN(pin);
    setResetPINStep("confirm");
  };

  const handleConfirmResetPIN = async (pin: string) => {
    if (pin !== firstResetPIN) {
      setShowPinMismatchModal(true);
      setFirstResetPIN("");
      setResetPINStep("first");
      return;
    }

    try {
      const hash = await hashPin(pin);
      const success = await enablePin(hash);
      if (success) {
        setShowResetPINModal(false);
        setResetPINStep("first");
        setFirstResetPIN("");
        setResetPINError("");
        setPinEnabledState(true);
        setShowPinSuccessModal(true);
      } else {
        setResetPINError("Could not set PIN. Please try again.");
      }
    } catch (e) /* istanbul ignore next */ {
      setResetPINError(`Failed to set PIN: ${e}`);
    }
  };

  const handleDisablePIN = async () => {
    try {
      const success = await disablePin();
      if (success) {
        setPinEnabledState(false);
        setResetPINStep("first");
        setFirstResetPIN("");
        setResetPINError("");
      } else {
        setResetPINError("Could not disable PIN. Please try again.");
      }
    } catch (e) /* istanbul ignore next */ {
      setResetPINError(`Failed to disable PIN: ${e}`);
    }
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel" },
      {
        text: "Log Out",
        /* istanbul ignore next */
        onPress: async () => {
          try {
            await authLogout();
          } catch {
            // best-effort — always clear local state
          }
          clearAuth();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: BG }}
      edges={["right", "left"]}
    >
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* User Profile Section */}
        <View
          style={{
            paddingVertical: 20,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: BORDER,
            backgroundColor: "#fff",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
              gap: 16,
            }}
          >
            {/* Avatar */}
            <TouchableOpacity onPress={handlePickPhoto} activeOpacity={0.8}>
              <View
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                  backgroundColor: TEAL_DARK,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={{ width: 88, height: 88, borderRadius: 44 }}
                  />
                ) : (
                  <Text
                    style={{ color: "#fff", fontSize: 34, fontWeight: "700" }}
                  >
                    {user?.name?.charAt(0).toUpperCase() ?? "?"}
                  </Text>
                )}
              </View>
              {/* Pencil overlay */}
              <View
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: TEAL,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor: "#fff",
                }}
              >
                <Ionicons name="pencil" size={13} color="#fff" />
              </View>
            </TouchableOpacity>

            {/* Name & email */}
            <View style={{ flex: 1 }}>
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
                  <Text
                    style={{ fontSize: 15, fontWeight: "700", color: TEXT }}
                  >
                    {user?.name ?? "User"}
                  </Text>
                  <Text style={{ fontSize: 11, color: MUTED }}>✎</Text>
                </TouchableOpacity>
              )}
              <Text style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>
                {user?.email ?? ""}
              </Text>
            </View>
          </View>
        </View>

        {/* AI Suggestions Toggle */}
        <View style={{ backgroundColor: "#fff", marginTop: 12 }}>
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
              Smart Suggestions
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

          {/* Pairing Suggestions Toggle */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 14,
              opacity: aiEnabled ? 1 : 0.4,
            }}
          >
            <View>
              <Text style={{ fontSize: 14, color: TEXT, fontWeight: "500" }}>
                Recipe Suggestions
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

          {/* Reset dismissed suggestions */}
          <TouchableOpacity
            onPress={() => {
              if (!user?.id) return;
              deleteItem(`dismissed_${user.id}`);
              Alert.alert(
                "Done",
                "Dismissed suggestions have been reset. They'll reappear on the list screen.",
              );
            }}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderTopColor: BORDER,
            }}
          >
            <Text style={{ fontSize: 14, color: TEAL, fontWeight: "500" }}>
              Reset Dismissed Suggestions
            </Text>
            <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              Items you've swiped away will reappear
            </Text>
          </TouchableOpacity>
        </View>

        {/* Biometric and PIN Section */}
        {isBiometricAvailable && (
          <View style={{ marginTop: 12, backgroundColor: "#fff" }}>
            {/* Biometric Toggle */}
            <View
              style={{
                borderBottomWidth: 1,
                borderBottomColor: BORDER,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <View>
                  <Text
                    style={{ fontSize: 14, color: TEXT, fontWeight: "500" }}
                  >
                    {biometricType?.includes("faceId")
                      ? "Face ID"
                      : biometricType?.includes("touchId")
                        ? "Touch ID"
                        : "Biometric"}{" "}
                    Login
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={async (val) => {
                    if (!val) {
                      await disableBiometric();
                      await disableBiometricLogin();
                      setBiometricEnabled(false);
                      setPinEnabledState(true);
                    } else {
                      const credentials = await getBiometricCredentials();
                      if (!credentials?.pinHash) {
                        Alert.alert(
                          "PIN Required",
                          "You need to set up a PIN first before enabling biometric login.",
                          [
                            {
                              text: "Set PIN",
                              onPress: () => {
                                setShowResetPINModal(true);
                                setResetPINStep("first");
                                setFirstResetPIN("");
                                setResetPINError("");
                              },
                            },
                          ],
                        );
                        return;
                      }

                      const bioSuccess = await authenticateWithBiometric();
                      if (!bioSuccess) {
                        Alert.alert(
                          "Biometric Setup Failed",
                          "Biometric authentication failed. Please try again.",
                          [{ text: "OK" }],
                        );
                        return;
                      }

                      try {
                        await setupBiometric(
                          credentials.pinHash,
                          biometricType || "faceId",
                        );
                        await setItem("biometric_enabled", "true");
                        setBiometricEnabled(true);
                        setPinEnabledState(true);
                        setShowBiometricSuccessModal(true);
                      } catch (error: any) /* istanbul ignore next */ {
                        Alert.alert(
                          "Setup Failed",
                          `Failed to enable biometric login: ${error.message || "Unknown error"}. Please try again.`,
                          [{ text: "OK" }],
                        );
                      }
                    }
                  }}
                  trackColor={{ false: BORDER, true: TEAL }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {/* PIN Toggle */}
            <View
              style={{
                borderBottomWidth: pinEnabled ? 0 : 1,
                borderBottomColor: BORDER,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <View>
                  <Text
                    style={{ fontSize: 14, color: TEXT, fontWeight: "500" }}
                  >
                    PIN Login
                  </Text>
                </View>
                <Switch
                  value={pinEnabled}
                  onValueChange={async (val) => {
                    if (val) {
                      setShowResetPINModal(true);
                      setResetPINStep("first");
                      setFirstResetPIN("");
                      setResetPINError("");
                    } else if (biometricEnabled) {
                      Alert.alert(
                        "PIN Always Active",
                        "PIN remains active as a fallback for biometric authentication.",
                        [{ text: "OK" }],
                      );
                    } else {
                      await handleDisablePIN();
                    }
                  }}
                  trackColor={{ false: BORDER, true: TEAL }}
                  thumbColor="#fff"
                  disabled={biometricEnabled}
                />
              </View>
            </View>
            {pinEnabled && (
              <View
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: BORDER,
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  alignItems: "center",
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    setShowResetPINModal(true);
                    setResetPINStep("first");
                    setFirstResetPIN("");
                    setResetPINError("");
                  }}
                  style={{
                    width: "80%",
                    backgroundColor: TEAL,
                    paddingVertical: 12,
                    borderRadius: 8,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{ fontSize: 16, color: "#fff", fontWeight: "600" }}
                  >
                    Reset PIN
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* List Sharing Section */}
        <View style={{ marginTop: 12, backgroundColor: "#fff" }}>
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: BORDER,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: MUTED,
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              Shared Lists
            </Text>
          </View>
          {sharingLists.length === 0 ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ fontSize: 14, color: MUTED }}>No lists yet.</Text>
            </View>
          ) : (
            sharingLists.map((list, idx) => (
              <View key={list.id}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth:
                      idx < sharingLists.length - 1 ||
                      (!list.owner_name && expandedListId === list.id)
                        ? 1
                        : 0,
                    borderBottomColor: BORDER,
                  }}
                >
                  {/* List name + collaborator count (owners can expand) */}
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                    onPress={() =>
                      !list.owner_name && handleExpandList(list.id)
                    }
                    disabled={!!list.owner_name}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "500",
                          color: TEXT,
                        }}
                        numberOfLines={1}
                      >
                        {list.name}
                      </Text>
                      {list.owner_name && (
                        <Text
                          style={{ fontSize: 12, color: MUTED, marginTop: 1 }}
                        >
                          Shared by {list.owner_name}
                        </Text>
                      )}
                    </View>
                    {!list.owner_name && (list.share_count ?? 0) > 0 && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Ionicons
                          name="people-outline"
                          size={14}
                          color={TEAL}
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            color: TEAL,
                            fontWeight: "600",
                          }}
                        >
                          {list.share_count}
                        </Text>
                      </View>
                    )}
                    {!list.owner_name && (
                      <Ionicons
                        name={
                          expandedListId === list.id
                            ? "chevron-up"
                            : "chevron-down"
                        }
                        size={16}
                        color={MUTED}
                      />
                    )}
                  </TouchableOpacity>

                  {/* Owner: Share button — Collaborator: Leave button */}
                  {!list.owner_name ? (
                    <TouchableOpacity
                      onPress={() => handleShareList(list)}
                      disabled={sharingLoadingId === list.id}
                      style={{
                        marginLeft: 12,
                        backgroundColor: TEAL,
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        borderRadius: 8,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      {sharingLoadingId === list.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons
                            name="share-outline"
                            size={14}
                            color="#fff"
                          />
                          <Text
                            style={{
                              fontSize: 13,
                              color: "#fff",
                              fontWeight: "600",
                            }}
                          >
                            Share
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleLeaveList(list)}
                      style={{
                        marginLeft: 12,
                        backgroundColor: "rgba(239,68,68,0.1)",
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        borderRadius: 8,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <Ionicons name="exit-outline" size={14} color="#EF4444" />
                      <Text
                        style={{
                          fontSize: 13,
                          color: "#EF4444",
                          fontWeight: "600",
                        }}
                      >
                        Leave
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Expanded collaborators list — owner only */}
                {!list.owner_name && expandedListId === list.id && (
                  <View style={{ backgroundColor: "#F8FAFB" }}>
                    {(shareDetails[list.id] ?? []).length === 0 ? (
                      <View
                        style={{ paddingHorizontal: 24, paddingVertical: 12 }}
                      >
                        <Text style={{ fontSize: 13, color: MUTED }}>
                          No active shares yet. Tap Share to invite someone.
                        </Text>
                      </View>
                    ) : (
                      (shareDetails[list.id] ?? []).map((share) => (
                        <View
                          key={share.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingHorizontal: 24,
                            paddingVertical: 10,
                            borderTopWidth: 1,
                            borderTopColor: BORDER,
                          }}
                        >
                          {/* Avatar circle */}
                          <View
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 17,
                              backgroundColor: TEAL_DARK,
                              alignItems: "center",
                              justifyContent: "center",
                              overflow: "hidden",
                              marginRight: 10,
                            }}
                          >
                            {share.shared_with_avatar_url ? (
                              <Image
                                source={{ uri: share.shared_with_avatar_url }}
                                style={{ width: 34, height: 34, borderRadius: 17 }}
                              />
                            ) : (
                              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
                                {(share.shared_with_name ?? share.shared_with_email ?? "?")
                                  .charAt(0)
                                  .toUpperCase()}
                              </Text>
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: 14,
                                color: TEXT,
                                fontWeight: "500",
                              }}
                            >
                              {share.shared_with_name ??
                                share.shared_with_email ??
                                "Pending invite"}
                            </Text>
                            {share.status === "pending" && (
                              <Text style={{ fontSize: 12, color: MUTED }}>
                                {share.created_at
                                  ? `Sent ${new Date(share.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                                  : "Invite pending"}
                              </Text>
                            )}
                          </View>
                          <TouchableOpacity
                            onPress={() =>
                              Alert.alert(
                                share.status === "pending"
                                  ? "Revoke Invite"
                                  : "Remove Collaborator",
                                share.status === "pending"
                                  ? "This will invalidate the invite link."
                                  : `Remove ${share.shared_with_name ?? "this person"} from this list?`,
                                [
                                  { text: "Cancel", style: "cancel" },
                                  {
                                    text:
                                      share.status === "pending"
                                        ? "Revoke"
                                        : "Remove",
                                    style: "destructive",
                                    onPress: () =>
                                      handleRemoveShare(list.id, share.id),
                                  },
                                ],
                              )
                            }
                            style={{ padding: 6 }}
                          >
                            <Ionicons
                              name="close-circle-outline"
                              size={20}
                              color="#EF4444"
                            />
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        {/* Utility Section */}
        <View style={{ marginTop: 12 }}>
          {/* Logout Button - Red, 80% width, centered */}
          <View
            style={{
              paddingVertical: 0,
              paddingHorizontal: 16,
              alignItems: "center",
            }}
          >
            <TouchableOpacity
              onPress={handleLogout}
              style={{
                width: "80%",
                backgroundColor: "#DC2626",
                paddingVertical: 12,
                borderRadius: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 16, color: "#fff", fontWeight: "600" }}>
                Log Out
              </Text>
            </TouchableOpacity>
          </View>

          {/* Version Info - Right aligned, dark grey text */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 16,
              alignItems: "flex-end",
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
              /* istanbul ignore next */
              try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const info = require("../../build-info.json");
                if (info && info.gitCommit) {
                  const hash = String(info.gitCommit).slice(0, 10);
                  build = build ? `${build}.${hash}` : hash;
                }
              } catch (e) {
                // file may not exist in some environments; ignore
              }

              return (
                <Text style={{ fontSize: 12, color: MUTED }}>
                  App Version {version}
                  {build ? ` (${build})` : ""}
                </Text>
              );
            })()}
          </View>
        </View>
      </ScrollView>

      {/* Reset PIN Modal */}
      <Modal visible={showResetPINModal} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <PINEntry
            title={resetPINStep === "first" ? "Set PIN" : "Confirm PIN"}
            subtitle={
              resetPINStep === "first"
                ? "Enter a 4-digit PIN to secure your account"
                : "Re-enter your PIN to confirm"
            }
            onComplete={
              resetPINStep === "first"
                ? handleFirstResetPIN
                : handleConfirmResetPIN
            }
            onCancel={() => {
              setShowResetPINModal(false);
              setResetPINStep("first");
              setFirstResetPIN("");
              setResetPINError("");
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* PIN Mismatch Modal */}
      <Modal
        visible={showPinMismatchModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPinMismatchModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: 24,
              margin: 20,
              alignItems: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 12,
            }}
          >
            <Ionicons
              name="alert-circle"
              size={48}
              color="#E53E3E"
              style={{ marginBottom: 16 }}
            />
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                color: TEXT,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              PINs Don't Match
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: MUTED,
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              The PINs you entered don't match. Please try again.
            </Text>
            <TouchableOpacity
              onPress={() => setShowPinMismatchModal(false)}
              style={{
                backgroundColor: TEAL,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 8,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                Try Again
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PIN Success Modal */}
      <Modal
        visible={showPinSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPinSuccessModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: 24,
              margin: 20,
              alignItems: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 12,
            }}
          >
            <Ionicons
              name="keypad"
              size={48}
              color={TEAL}
              style={{ marginBottom: 16 }}
            />
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                color: TEXT,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              PIN Enabled
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: MUTED,
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              You can now use your PIN to log in quickly.
            </Text>
            <TouchableOpacity
              onPress={() => setShowPinSuccessModal(false)}
              style={{
                backgroundColor: TEAL,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 8,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                Got it
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Biometric Success Modal */}
      <Modal
        visible={showBiometricSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBiometricSuccessModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: 24,
              margin: 20,
              alignItems: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 12,
            }}
          >
            <Ionicons
              name={
                biometricType?.includes("faceId") ? "person" : "finger-print"
              }
              size={48}
              color={TEAL}
              style={{ marginBottom: 16 }}
            />
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                color: TEXT,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              {biometricType?.includes("faceId")
                ? "Face ID"
                : biometricType?.includes("touchId")
                  ? "Touch ID"
                  : "Biometric"}{" "}
              Enabled
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: MUTED,
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              You can now use{" "}
              {biometricType?.includes("faceId")
                ? "Face ID"
                : biometricType?.includes("touchId")
                  ? "Touch ID"
                  : "biometric authentication"}{" "}
              to log in quickly.
            </Text>
            <TouchableOpacity
              onPress={() => setShowBiometricSuccessModal(false)}
              style={{
                backgroundColor: TEAL,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 8,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                Got it
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
