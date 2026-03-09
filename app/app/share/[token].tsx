import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../lib/store";
import { acceptListInvite } from "../../lib/api";
import { setItem } from "../../lib/storage";

const TEAL = "#1B6B7A";
const TEAL_DARK = "#0D4F5C";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";

type State =
  | { status: "loading" }
  | { status: "success"; listName: string }
  | { status: "already_member" }
  | { status: "error"; message: string }
  | { status: "redirecting" };

export default function ShareAcceptScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { token: authToken } = useAuthStore();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "Invalid invite link." });
      return;
    }

    if (!authToken) {
      // Not logged in — stash token and send to login
      setItem("pending_invite_token", token).then(() => {
        setState({ status: "redirecting" });
        router.replace("/(auth)/welcome");
      });
      return;
    }

    // Logged in — accept now
    acceptListInvite(token)
      .then((res) => {
        const listName: string = res.data?.list_name ?? "the list";
        setState({ status: "success", listName });
      })
      .catch((err) => {
        const detail: string = err?.response?.data?.detail ?? "";
        if (
          detail.toLowerCase().includes("already") ||
          err?.response?.status === 409
        ) {
          setState({ status: "already_member" });
        } else if (
          detail.toLowerCase().includes("not found") ||
          err?.response?.status === 404
        ) {
          setState({
            status: "error",
            message: "This invite link has expired or already been used.",
          });
        } else {
          setState({
            status: "error",
            message: detail || "Something went wrong. Please try again.",
          });
        }
      });
  }, [token, authToken]);

  const goToList = () => router.replace("/(app)/list");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: TEAL_DARK }}>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }}
      >
        {state.status === "loading" || state.status === "redirecting" ? (
          <>
            <ActivityIndicator size="large" color="#fff" />
            <Text
              style={{
                color: "rgba(255,255,255,0.75)",
                marginTop: 16,
                fontSize: 15,
              }}
            >
              {state.status === "redirecting"
                ? "Redirecting to sign in…"
                : "Accepting invite…"}
            </Text>
          </>
        ) : state.status === "success" ? (
          <View style={{ alignItems: "center" }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: "rgba(255,255,255,0.15)",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <Ionicons name="checkmark" size={40} color="#fff" />
            </View>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "700",
                color: "#fff",
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              You're in!
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: "rgba(255,255,255,0.75)",
                textAlign: "center",
                marginBottom: 32,
                lineHeight: 22,
              }}
            >
              You now have access to{" "}
              <Text style={{ fontWeight: "700", color: "#fff" }}>
                {state.listName}
              </Text>
              .
            </Text>
            <TouchableOpacity
              onPress={goToList}
              style={{
                backgroundColor: "#fff",
                paddingHorizontal: 32,
                paddingVertical: 14,
                borderRadius: 12,
              }}
            >
              <Text
                style={{ color: TEAL_DARK, fontWeight: "700", fontSize: 16 }}
              >
                Go to list
              </Text>
            </TouchableOpacity>
          </View>
        ) : state.status === "already_member" ? (
          <View style={{ alignItems: "center" }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: "rgba(255,255,255,0.15)",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <Ionicons name="people-outline" size={36} color="#fff" />
            </View>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "700",
                color: "#fff",
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              Already a member
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: "rgba(255,255,255,0.75)",
                textAlign: "center",
                marginBottom: 32,
              }}
            >
              You already have access to this list.
            </Text>
            <TouchableOpacity
              onPress={goToList}
              style={{
                backgroundColor: "#fff",
                paddingHorizontal: 32,
                paddingVertical: 14,
                borderRadius: 12,
              }}
            >
              <Text
                style={{ color: TEAL_DARK, fontWeight: "700", fontSize: 16 }}
              >
                Go to list
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ alignItems: "center" }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: "rgba(255,255,255,0.12)",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <Ionicons
                name="alert-circle-outline"
                size={36}
                color="rgba(255,255,255,0.8)"
              />
            </View>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "700",
                color: "#fff",
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              Invite unavailable
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: "rgba(255,255,255,0.75)",
                textAlign: "center",
                marginBottom: 32,
                lineHeight: 22,
              }}
            >
              {state.message}
            </Text>
            {authToken && (
              <TouchableOpacity
                onPress={goToList}
                style={{
                  backgroundColor: "#fff",
                  paddingHorizontal: 32,
                  paddingVertical: 14,
                  borderRadius: 12,
                }}
              >
                <Text
                  style={{ color: TEAL_DARK, fontWeight: "700", fontSize: 16 }}
                >
                  Go to my list
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
