import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Alert,
  ScrollView,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import {
  cacheDirectory,
  writeAsStringAsync,
  readAsStringAsync,
  EncodingType,
} from "expo-file-system/legacy";
import { COLORS } from "../../lib/constants";
import { exportMyData, importMyData } from "../../lib/api";

export default function ManageDataScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const handleExport = async () => {
    setLoading(true);
    setStatus("");
    try {
      const res = await exportMyData();
      const json = JSON.stringify(res.data, null, 2);
      const filename = `cartaraiq-export-${new Date().toISOString().slice(0, 10)}.json`;
      const filePath = `${cacheDirectory}${filename}`;

      await writeAsStringAsync(filePath, json, {
        encoding: EncodingType.UTF8,
      });

      await Share.share({
        url: filePath,
        title: "CartaraIQ Data Export",
      });

      setStatus("Export complete");
    } catch (e: any) {
      Alert.alert("Export failed", e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setStatus("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const fsFile = result.assets?.[0];
      if (!fsFile?.uri) return;

      const content = await readAsStringAsync(fsFile.uri, {
        encoding: EncodingType.UTF8,
      });

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        Alert.alert("Invalid file", "The selected file is not valid JSON.");
        return;
      }

      if (!parsed.lists || !Array.isArray(parsed.lists)) {
        Alert.alert(
          "Invalid format",
          "The file doesn't contain a valid CartaraIQ data export."
        );
        return;
      }

      Alert.alert(
        "Import data?",
        `This will replace all your current lists and items with ${parsed.lists.length} list(s) from the file. This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Import",
            style: "destructive",
            onPress: async () => {
              setLoading(true);
              try {
                await importMyData({
                  lists: parsed.lists,
                  version: parsed.version ?? 1,
                });
                setStatus("Import complete — your data has been replaced.");
              } catch (e: any) {
                Alert.alert(
                  "Import failed",
                  e.response?.data?.detail ?? e.message ?? "Something went wrong"
                );
              } finally {
                setLoading(false);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not read the file.");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 28,
            paddingTop: 12,
          }}
        >
          {/* Back */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              marginBottom: 24,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons
              name="chevron-back"
              size={30}
              color={COLORS.tealDark}
            />
          </TouchableOpacity>

          {/* Header */}
          <Text
            style={{
              fontFamily: "Montserrat_700Bold",
              fontSize: 32,
              color: COLORS.ink,
              lineHeight: 40,
              marginBottom: 8,
            }}
          >
            Manage{"\n"}my data
          </Text>
          <Text
            style={{
              fontFamily: "Montserrat_400Regular",
              fontSize: 15,
              color: COLORS.muted,
              marginBottom: 32,
            }}
          >
            Export your lists as JSON or import from a previous export.
          </Text>

          {/* Export Card */}
          <TouchableOpacity
            onPress={handleExport}
            disabled={loading}
            activeOpacity={0.85}
            style={{
              backgroundColor: COLORS.card,
              borderRadius: 16,
              padding: 20,
              marginBottom: 16,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: COLORS.teal + "18",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 16,
              }}
            >
              <Ionicons name="download-outline" size={24} color={COLORS.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "Montserrat_600SemiBold",
                  fontSize: 16,
                  color: COLORS.ink,
                  marginBottom: 2,
                }}
              >
                Export data
              </Text>
              <Text
                style={{
                  fontFamily: "Montserrat_400Regular",
                  fontSize: 13,
                  color: COLORS.muted,
                }}
              >
                Save all your lists as a JSON file
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={COLORS.muted}
            />
          </TouchableOpacity>

          {/* Import Card */}
          <TouchableOpacity
            onPress={handleImport}
            disabled={loading}
            activeOpacity={0.85}
            style={{
              backgroundColor: COLORS.card,
              borderRadius: 16,
              padding: 20,
              marginBottom: 16,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: COLORS.teal + "18",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 16,
              }}
            >
              <Ionicons name="push-outline" size={24} color={COLORS.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "Montserrat_600SemiBold",
                  fontSize: 16,
                  color: COLORS.ink,
                  marginBottom: 2,
                }}
              >
                Import data
              </Text>
              <Text
                style={{
                  fontFamily: "Montserrat_400Regular",
                  fontSize: 13,
                  color: COLORS.muted,
                }}
              >
                Replace your lists from a JSON backup
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={COLORS.muted}
            />
          </TouchableOpacity>

          {/* Loading / status */}
          {loading && (
            <ActivityIndicator
              color={COLORS.teal}
              style={{ marginTop: 24 }}
            />
          )}
          {!!status && (
            <Text
              style={{
                fontFamily: "Montserrat_500Medium",
                fontSize: 14,
                color: COLORS.teal,
                textAlign: "center",
                marginTop: 20,
              }}
            >
              {status}
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
