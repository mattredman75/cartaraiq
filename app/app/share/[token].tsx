import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StyleSheet,
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

const TEAL_DARK = "#0D4F5C";
const LIST_GREEN = "#27AE60";
const CANVAS_BG = "#E4F0E8";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";

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

  // Fetch invite preview — no auth required
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

  // ── Owner avatar ─────────────────────────────────────────────────────────────
  const OwnerAvatar = () => (
    <View style={styles.avatarRing}>
      {preview?.owner_avatar_url ? (
        <Image
          source={{ uri: preview.owner_avatar_url }}
          style={styles.avatarImage}
        />
      ) : (
        <Text style={styles.avatarInitial}>{ownerInitial}</Text>
      )}
    </View>
  );

  // ── Preview / busy card ───────────────────────────────────────────────────────
  if (phase === "preview" || phase === "busy") {
    return (
      <SafeAreaView style={styles.canvas} edges={["top"]}>
        {/* Top section: greyed list preview */}
        <View style={styles.topCanvas}>
          <View style={styles.listCard}>
            <Text style={styles.listCardTitle} numberOfLines={1}>
              {preview?.list_name ?? "Shopping List"}
            </Text>
            {[0.9, 0.6, 0.45].map((w, i) => (
              <View key={i} style={styles.skeletonRow}>
                <View style={styles.skeletonCircle} />
                <View style={[styles.skeletonBar, { flex: w }]} />
              </View>
            ))}
          </View>
        </View>

        {/* White bottom panel */}
        <View style={styles.panel}>
          {/* Avatar half-overlapping the top edge */}
          <View style={styles.avatarOverlap}>
            <OwnerAvatar />
          </View>

          <Text style={styles.inviteText}>
            <Text style={{ fontWeight: "700" }}>{ownerLabel}</Text>
            {" invites you to the list:"}
          </Text>

          <Text style={styles.listNameLabel}>
            {preview?.list_name?.toUpperCase()}
          </Text>

          <Text style={styles.subtext}>
            When the list is shared, any changes are instantly visible to
            everyone.
          </Text>

          {phase === "busy" ? (
            <ActivityIndicator
              size="large"
              color={LIST_GREEN}
              style={{ marginVertical: 24 }}
            />
          ) : (
            <>
              <TouchableOpacity
                style={styles.acceptButton}
                onPress={handleAccept}
                activeOpacity={0.85}
              >
                <Text style={styles.acceptButtonText}>OPEN LIST</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.declineButton}
                onPress={handleDecline}
                activeOpacity={0.7}
              >
                <Text style={styles.declineButtonText}>DISCARD INVITE</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Terminal states ───────────────────────────────────────────────────────────
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
  // Green canvas layout
  canvas: {
    flex: 1,
    backgroundColor: CANVAS_BG,
  },
  topCanvas: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 48,
    justifyContent: "flex-end",
  },
  listCard: {
    backgroundColor: "#D4D4D4",
    borderRadius: 18,
    padding: 18,
    opacity: 0.8,
  },
  listCardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#555",
    marginBottom: 14,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#bbb",
  },
  skeletonCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#999",
    marginRight: 12,
  },
  skeletonBar: {
    height: 11,
    backgroundColor: "#b0b0b0",
    borderRadius: 6,
  },

  // White bottom panel
  panel: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 52,
    paddingBottom: 44,
    paddingHorizontal: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 10,
  },
  avatarOverlap: {
    position: "absolute",
    top: -40,
    alignSelf: "center",
  },
  avatarRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#0D4F5C",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 4,
    borderColor: "#fff",
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarInitial: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "700",
  },
  inviteText: {
    fontSize: 16,
    color: TEXT,
    textAlign: "center",
    marginBottom: 6,
  },
  listNameLabel: {
    fontSize: 26,
    fontWeight: "800",
    color: LIST_GREEN,
    textAlign: "center",
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  subtext: {
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
    maxWidth: 290,
  },
  acceptButton: {
    backgroundColor: LIST_GREEN,
    borderRadius: 50,
    paddingVertical: 17,
    width: "100%",
    alignItems: "center",
    marginBottom: 16,
  },
  acceptButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.8,
  },
  declineButton: {
    paddingVertical: 10,
  },
  declineButtonText: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  // Dark terminal states
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
  terminalBlock: {
    alignItems: "center",
  },
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
