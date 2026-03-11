import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../lib/store";
import {
  previewListInvite,
  acceptListInvite,
  declineListInvite,
} from "../../lib/api";
import { setItem } from "../../lib/storage";
import { sanitizeAvatarUrl } from "../../lib/constants";

const TEAL_DARK = "#0D4F5C";
const TEAL_BTN = "#0D4F5C";
const RED_BTN = "#C0392B";
const TEXT = "#1A1A2E";
const MUTED = "#94A3B8";
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const AVATAR_SIZE = 80;
const NUM_RAYS = 18;
const RAY_LENGTH = SCREEN_W * 1.6;
const RAY_THICKNESS = 40;

type Preview = {
  list_id: string;
  list_name: string;
  owner_name: string | null;
  owner_avatar_url: string | null;
};

type Phase =
  | "loading"
  | "preview"
  | "busy"
  | "success"
  | "declined"
  | "already_member"
  | "redirecting"
  | "error";

export default function ShareAcceptScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { token: authToken } = useAuthStore();
  const [phase, setPhase] = useState<Phase>("loading");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [successListName, setSuccessListName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setErrorMsg("Invalid invite link.");
      setPhase("error");
      return;
    }
    previewListInvite(token)
      .then((res) => {
        setPreview(res.data);
        setPhase("preview");
      })
      .catch((err) => {
        if (err?.response?.status === 409) {
          setPhase("already_member");
        } else {
          setErrorMsg(
            err?.response?.status === 404
              ? "This invite link has expired or has already been used."
              : err?.response?.data?.detail || "Something went wrong.",
          );
          setPhase("error");
        }
      });
  }, [token]);

  const handleAccept = async () => {
    if (!authToken) {
      await setItem("pending_invite_token", token ?? "");
      setPhase("redirecting");
      router.replace("/(auth)/welcome");
      return;
    }
    setPhase("busy");
    try {
      const res = await acceptListInvite(token ?? "");
      setSuccessListName(
        res.data?.list_name ?? preview?.list_name ?? "the list",
      );
      setPhase("success");
    } catch (err: any) {
      if (
        err?.response?.status === 409 ||
        err?.response?.data?.detail?.toLowerCase().includes("already")
      ) {
        setPhase("already_member");
      } else {
        setErrorMsg(err?.response?.data?.detail || "Something went wrong.");
        setPhase("error");
      }
    }
  };

  const handleDecline = async () => {
    if (!authToken) {
      router.replace("/(auth)/welcome");
      return;
    }
    setPhase("busy");
    try {
      await declineListInvite(token ?? "");
    } catch {
      // ignore — still show declined state
    }
    setPhase("declined");
  };

  const goToList = () => router.replace("/(app)/list");

  const ownerLabel = preview?.owner_name ?? "Someone";
  const ownerInitial = ownerLabel.charAt(0).toUpperCase();
  const listName = preview?.list_name ?? "Shopping List";

  const OwnerAvatar = () => (
    <View style={styles.avatarRing}>
      {preview?.owner_avatar_url ? (
        <Image
          source={{ uri: sanitizeAvatarUrl(preview.owner_avatar_url) }}
          style={styles.avatarImage}
        />
      ) : (
        <Text style={styles.avatarInitial}>{ownerInitial}</Text>
      )}
    </View>
  );

  // ── Preview / busy ────────────────────────────────────────────────────────────
  if (phase === "preview" || phase === "busy") {
    return (
      <View style={styles.root}>
        {/* ── Dark overlay with sunray top section ── */}
        <SafeAreaView style={styles.topSection} edges={["top"]}>
          {/* Sunrays radiating from center */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {Array.from({ length: NUM_RAYS }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.ray,
                  {
                    transform: [
                      { rotate: `${(i * 360) / NUM_RAYS}deg` },
                    ],
                  },
                ]}
              />
            ))}
          </View>

          {/* Dismiss X */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/(app)/list")
            }
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={styles.closeBtnCircle}>
              <Ionicons name="close" size={20} color="#fff" />
            </View>
          </TouchableOpacity>

          {/* Live sharing heading */}
          <View style={styles.headingRow}>
            <View style={styles.redDot} />
            <Text style={styles.headingText}>Live sharing</Text>
          </View>

          {/* List preview card */}
          <View style={styles.listCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="chevron-back" size={18} color="#555" />
              <Text style={styles.cardHeaderTitle} numberOfLines={1}>
                {listName}
              </Text>
              <View style={styles.cardHeaderRight}>
                <View style={[styles.miniAvatar, { backgroundColor: TEAL_DARK }]}>
                  <Text style={styles.miniAvatarText}>{ownerInitial}</Text>
                </View>
                <Ionicons name="ellipsis-vertical" size={16} color="#888" style={{ marginLeft: 8 }} />
              </View>
            </View>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: "0%" }]} />
            </View>
            {[
              { w: 0.55 },
              { w: 0.38 },
              { w: 0.45 },
            ].map((item, i) => (
              <View key={i} style={styles.itemRow}>
                <View style={styles.checkbox} />
                <View style={[styles.itemBar, { flex: item.w }]} />
              </View>
            ))}
          </View>
        </SafeAreaView>

        {/* ── White bottom panel ── */}
        <View style={styles.panel}>
          {/* Avatar straddling the seam */}
          <View style={styles.avatarOverlap}>
            <OwnerAvatar />
          </View>

          <Text style={styles.inviteLabel}>
            <Text style={{ fontWeight: "700" }}>{ownerLabel}</Text>
            {" invites you to the list:"}
          </Text>

          <Text style={styles.listNameLabel}>
            {listName.toUpperCase()}
          </Text>

          <Text style={styles.subtext}>
            When the list is shared, any changes are instantly visible to everyone.
          </Text>

          {phase === "busy" ? (
            <ActivityIndicator
              size="large"
              color={TEAL_BTN}
              style={{ marginVertical: 20 }}
            />
          ) : (
            <>
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={handleAccept}
                activeOpacity={0.85}
              >
                <Text style={styles.acceptBtnText}>ACCEPT INVITE</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.declineBtn}
                onPress={handleDecline}
                activeOpacity={0.85}
              >
                <Text style={styles.declineBtnText}>DISCARD INVITE</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  // ── Terminal states ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.darkScreen}>
      <View style={styles.centeredContainer}>
        {(phase === "loading" || phase === "redirecting") && (
          <>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.darkSubtext}>
              {phase === "redirecting"
                ? "Redirecting to sign in…"
                : "Loading invite…"}
            </Text>
          </>
        )}

        {phase === "success" && (
          <View style={styles.terminalBlock}>
            <View style={styles.iconRing}>
              <Ionicons name="checkmark" size={40} color="#fff" />
            </View>
            <Text style={styles.terminalTitle}>You're in!</Text>
            <Text style={styles.darkSubtext}>
              You now have access to{" "}
              <Text style={{ fontWeight: "700", color: "#fff" }}>
                {successListName}
              </Text>
              .
            </Text>
            <TouchableOpacity style={styles.lightButton} onPress={goToList}>
              <Text style={styles.lightButtonText}>Go to list</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === "declined" && (
          <View style={styles.terminalBlock}>
            <View
              style={[
                styles.iconRing,
                { backgroundColor: "rgba(255,255,255,0.12)" },
              ]}
            >
              <Ionicons
                name="close-circle-outline"
                size={40}
                color="rgba(255,255,255,0.8)"
              />
            </View>
            <Text style={styles.terminalTitle}>Invite discarded</Text>
            <Text style={styles.darkSubtext}>
              You've declined the invite
              {preview?.list_name ? ` to "${preview.list_name}"` : ""}.
            </Text>
          </View>
        )}

        {phase === "already_member" && (
          <View style={styles.terminalBlock}>
            <View style={styles.iconRing}>
              <Ionicons name="people-outline" size={36} color="#fff" />
            </View>
            <Text style={styles.terminalTitle}>Already a member</Text>
            <Text style={styles.darkSubtext}>
              You already have access to this list.
            </Text>
            <TouchableOpacity style={styles.lightButton} onPress={goToList}>
              <Text style={styles.lightButtonText}>Go to list</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === "error" && (
          <View style={styles.terminalBlock}>
            <View
              style={[
                styles.iconRing,
                { backgroundColor: "rgba(255,255,255,0.12)" },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={36}
                color="rgba(255,255,255,0.8)"
              />
            </View>
            <Text style={styles.terminalTitle}>Invite unavailable</Text>
            <Text style={styles.darkSubtext}>{errorMsg}</Text>
            {authToken && (
              <TouchableOpacity style={styles.lightButton} onPress={goToList}>
                <Text style={styles.lightButtonText}>Go to my lists</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },

  // ── Dark top section with sunrays
  topSection: {
    backgroundColor: "rgba(0,0,0,0.88)",
    paddingHorizontal: 24,
    paddingBottom: AVATAR_SIZE / 2 + 8,
    height: SCREEN_H * 0.58,
    justifyContent: "flex-end",
    overflow: "hidden",
  },

  // Sunray: tall rectangle positioned at horizontal center, rotated around its left edge
  ray: {
    position: "absolute",
    width: RAY_LENGTH,
    height: RAY_THICKNESS,
    left: SCREEN_W / 2,
    top: SCREEN_H * 0.28 - RAY_THICKNESS / 2,
    backgroundColor: "rgba(255,255,255,0.028)",
    transformOrigin: "left center",
  },

  closeBtn: {
    position: "absolute",
    top: 56,
    right: 20,
    zIndex: 10,
  },
  closeBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    gap: 10,
  },
  redDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#E53935",
  },
  headingText: {
    fontSize: 30,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.5,
  },

  // ── List preview card
  listCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  cardHeaderTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    marginLeft: 2,
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  miniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  miniAvatarText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  progressBg: {
    height: 3,
    backgroundColor: "#E0E0E0",
  },
  progressFill: {
    height: 3,
    backgroundColor: TEAL_DARK,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F0F0F0",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#90CAF9",
    marginRight: 12,
  },
  itemBar: {
    height: 9,
    backgroundColor: "#E8E8E8",
    borderRadius: 4,
  },

  // ── White bottom panel
  panel: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: AVATAR_SIZE / 2 + 12,
    paddingBottom: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    marginTop: -(AVATAR_SIZE / 2),
    // top drop shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 20,
  },
  avatarOverlap: {
    position: "absolute",
    top: -(AVATAR_SIZE / 2),
    alignSelf: "center",
    zIndex: 10,
  },
  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: TEAL_DARK,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarInitial: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "800",
  },
  inviteLabel: {
    fontSize: 15,
    color: TEXT,
    textAlign: "center",
    marginBottom: 4,
    lineHeight: 22,
  },
  listNameLabel: {
    fontSize: 22,
    fontWeight: "800",
    color: TEAL_DARK,
    textAlign: "center",
    letterSpacing: 2,
    marginBottom: 10,
  },
  subtext: {
    fontSize: 12,
    color: MUTED,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  acceptBtn: {
    backgroundColor: TEAL_BTN,
    borderRadius: 10,
    paddingVertical: 15,
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
  },
  acceptBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.8,
  },
  declineBtn: {
    backgroundColor: RED_BTN,
    borderRadius: 10,
    paddingVertical: 15,
    width: "100%",
    alignItems: "center",
  },
  declineBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.5,
  },

  // ── Terminal states
  darkScreen: {
    flex: 1,
    backgroundColor: TEAL_DARK,
  },
  centeredContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  terminalBlock: { alignItems: "center" },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  terminalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  darkSubtext: {
    fontSize: 15,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 22,
    marginBottom: 32,
  },
  lightButton: {
    backgroundColor: "#fff",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  lightButtonText: {
    color: TEAL_DARK,
    fontWeight: "700",
    fontSize: 16,
  },
});
