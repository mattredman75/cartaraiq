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
const LIST_GREEN = "#2ECC71";
const CANVAS_BG = "#C8E6C9"; // warm sage green matching reference
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const SCREEN_H = Dimensions.get("window").height;
const AVATAR_SIZE = 88;

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
        {/* ── Green top section ── */}
        <SafeAreaView style={styles.topSection} edges={["top"]}>
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
            {/* Card header */}
            <View style={styles.cardHeader}>
              <Ionicons name="chevron-back" size={18} color="#555" />
              <Text style={styles.cardHeaderTitle} numberOfLines={1}>
                {listName}
              </Text>
              <View style={styles.cardHeaderRight}>
                <View
                  style={[styles.miniAvatar, { backgroundColor: TEAL_DARK }]}
                >
                  <Text style={styles.miniAvatarText}>{ownerInitial}</Text>
                </View>
                <Ionicons
                  name="ellipsis-vertical"
                  size={16}
                  color="#888"
                  style={{ marginLeft: 8 }}
                />
              </View>
            </View>
            {/* Progress bar */}
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: "0%" }]} />
            </View>
            {/* Skeleton item rows */}
            {[
              { label: "item 1", w: 0.55 },
              { label: "item 2", w: 0.38 },
              { label: "item 3", w: 0.45 },
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

          {/* Content */}
          <Text style={styles.inviteLabel}>
            <Text style={{ fontWeight: "700" }}>{ownerLabel}</Text>
            {" invites you to the list:"}
          </Text>

          <Text style={styles.listNameLabel}>
            {"• "}
            {listName.toUpperCase()}
            {" •"}
          </Text>

          <Text style={styles.subtext}>
            When the list is shared, any changes are{"\n"}instantly visible to
            everyone.
          </Text>

          {phase === "busy" ? (
            <ActivityIndicator
              size="large"
              color={LIST_GREEN}
              style={{ marginVertical: 20 }}
            />
          ) : (
            <>
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={handleAccept}
                activeOpacity={0.85}
              >
                <Text style={styles.acceptBtnText}>OPEN LIST</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.declineBtn}
                onPress={handleDecline}
                activeOpacity={0.7}
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
    backgroundColor: CANVAS_BG,
  },

  // ── Green top section
  topSection: {
    backgroundColor: CANVAS_BG,
    paddingHorizontal: 24,
    paddingBottom: AVATAR_SIZE / 2 + 8, // leave room for avatar overlap
    minHeight: SCREEN_H * 0.52,
    justifyContent: "flex-end",
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
    backgroundColor: "rgba(0,0,0,0.18)",
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
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#E53935",
  },
  headingText: {
    fontSize: 34,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -0.5,
  },

  // ── List preview card
  listCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardHeaderTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
    marginLeft: 2,
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  miniAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  miniAvatarText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  progressBg: {
    height: 4,
    backgroundColor: "#E8F5E9",
    marginHorizontal: 0,
  },
  progressFill: {
    height: 4,
    backgroundColor: LIST_GREEN,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F0F0F0",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#90CAF9",
    marginRight: 14,
  },
  itemBar: {
    height: 10,
    backgroundColor: "#E0E0E0",
    borderRadius: 5,
  },

  // ── White bottom panel
  panel: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: AVATAR_SIZE / 2 + 16,
    paddingBottom: 36,
    paddingHorizontal: 28,
    alignItems: "center",
    marginTop: -(AVATAR_SIZE / 2),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 12,
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
    borderWidth: 4,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarInitial: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
  },
  inviteLabel: {
    fontSize: 16,
    color: TEXT,
    textAlign: "center",
    marginBottom: 6,
    lineHeight: 22,
  },
  listNameLabel: {
    fontSize: 24,
    fontWeight: "800",
    color: LIST_GREEN,
    textAlign: "center",
    letterSpacing: 2,
    marginBottom: 12,
  },
  subtext: {
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
  acceptBtn: {
    backgroundColor: LIST_GREEN,
    borderRadius: 50,
    paddingVertical: 18,
    width: "100%",
    alignItems: "center",
    marginBottom: 16,
  },
  acceptBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 1,
  },
  declineBtn: {
    paddingVertical: 8,
  },
  declineBtnText: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "600",
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
