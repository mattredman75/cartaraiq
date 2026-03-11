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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../lib/store";
import {
  previewListInvite,
  acceptListInvite,
  declineListInvite,
} from "../../lib/api";
import { setItem } from "../../lib/storage";
import { sanitizeAvatarUrl } from "../../lib/constants";

const TEAL = "#0D4F5C";
const RED = "#C0392B";
const TEXT = "#1A1A2E";
const MUTED = "#94A3B8";
const AVATAR_SIZE = 80;

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
  const insets = useSafeAreaInsets();
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
      // ignore
    }
    setPhase("declined");
  };

  const dismiss = () =>
    router.canGoBack() ? router.back() : router.replace("/(app)/list");

  const goToList = () => router.replace("/(app)/list");

  const ownerLabel = preview?.owner_name ?? "Someone";
  const ownerInitial = ownerLabel.charAt(0).toUpperCase();
  const listName = preview?.list_name ?? "Shopping List";

  const OwnerAvatar = () => (
    <View style={styles.avatarRing}>
      {preview?.owner_avatar_url ? (
        <Image
          source={{ uri: sanitizeAvatarUrl(preview.owner_avatar_url) }}
          style={styles.avatarImg}
        />
      ) : (
        <Text style={styles.avatarInitial}>{ownerInitial}</Text>
      )}
    </View>
  );

  // Panel content varies by phase
  const renderPanelContent = () => {
    if (phase === "loading" || phase === "redirecting") {
      return (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={TEAL} />
          <Text style={styles.stateSubtext}>
            {phase === "redirecting"
              ? "Redirecting to sign in…"
              : "Loading invite…"}
          </Text>
        </View>
      );
    }

    if (phase === "success") {
      return (
        <View style={styles.centeredState}>
          <View style={[styles.stateIcon, { backgroundColor: TEAL }]}>
            <Ionicons name="checkmark" size={32} color="#fff" />
          </View>
          <Text style={styles.stateTitle}>You're in!</Text>
          <Text style={styles.stateSubtext}>
            You now have access to{" "}
            <Text style={{ fontWeight: "700", color: TEXT }}>
              {successListName}
            </Text>
            .
          </Text>
          <TouchableOpacity style={styles.acceptBtn} onPress={goToList}>
            <Text style={styles.acceptBtnText}>GO TO LIST</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (phase === "declined") {
      return (
        <View style={styles.centeredState}>
          <View style={[styles.stateIcon, { backgroundColor: MUTED }]}>
            <Ionicons name="close" size={32} color="#fff" />
          </View>
          <Text style={styles.stateTitle}>Invite discarded</Text>
          <Text style={styles.stateSubtext}>
            You've declined the invite
            {preview?.list_name ? ` to "${preview.list_name}"` : ""}.
          </Text>
          <TouchableOpacity style={styles.declineBtn} onPress={dismiss}>
            <Text style={styles.declineBtnText}>CLOSE</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (phase === "already_member") {
      return (
        <View style={styles.centeredState}>
          <View style={[styles.stateIcon, { backgroundColor: TEAL }]}>
            <Ionicons name="people" size={28} color="#fff" />
          </View>
          <Text style={styles.stateTitle}>Already a member</Text>
          <Text style={styles.stateSubtext}>
            You already have access to this list.
          </Text>
          <TouchableOpacity style={styles.acceptBtn} onPress={goToList}>
            <Text style={styles.acceptBtnText}>GO TO LIST</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (phase === "error") {
      return (
        <View style={styles.centeredState}>
          <View style={[styles.stateIcon, { backgroundColor: RED }]}>
            <Ionicons name="alert" size={28} color="#fff" />
          </View>
          <Text style={styles.stateTitle}>Invite unavailable</Text>
          <Text style={styles.stateSubtext}>{errorMsg}</Text>
          {authToken && (
            <TouchableOpacity style={styles.acceptBtn} onPress={goToList}>
              <Text style={styles.acceptBtnText}>GO TO MY LISTS</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    // preview or busy
    return (
      <>
        <Text style={styles.inviteLabel}>
          <Text style={{ fontWeight: "700" }}>{ownerLabel}</Text>
          {" invites you to the list:"}
        </Text>
        <Text style={styles.listNameLabel}>{listName.toUpperCase()}</Text>
        <Text style={styles.subtext}>
          When the list is shared, any changes are instantly visible to
          everyone.
        </Text>
        {phase === "busy" ? (
          <ActivityIndicator
            size="large"
            color={TEAL}
            style={{ marginVertical: 16 }}
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
      </>
    );
  };

  const showAvatar = phase === "preview" || phase === "busy";

  return (
    <View style={styles.overlay}>
      {/* Dimmed backdrop — tap to dismiss */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        onPress={dismiss}
        activeOpacity={1}
      />

      {/* Bottom sheet panel */}
      <View style={[styles.panel, { paddingBottom: insets.bottom + 16 }]}>
        {showAvatar && (
          <View style={styles.avatarOverlap}>
            <OwnerAvatar />
          </View>
        )}

        {/* Drag handle */}
        <View style={styles.handle} />

        <View
          style={[
            styles.panelContent,
            showAvatar && { paddingTop: AVATAR_SIZE / 2 + 8 },
          ]}
        >
          {renderPanelContent()}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 24,
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
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
  },
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarInitial: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "800",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 8,
  },
  panelContent: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    alignItems: "center",
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
    color: TEAL,
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
    backgroundColor: TEAL,
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
    backgroundColor: RED,
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

  // Terminal state layout within the panel
  centeredState: {
    alignItems: "center",
    paddingVertical: 8,
    width: "100%",
  },
  stateIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  stateTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: TEXT,
    marginBottom: 6,
    textAlign: "center",
  },
  stateSubtext: {
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 20,
    marginTop: 4,
  },
});
