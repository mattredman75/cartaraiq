import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, Camera } from "expo-camera";
import { ColorSelector } from "./ColorSelector";
import type { StoreCard } from "../lib/types";

interface AddCardModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (card: StoreCard) => void;
}

type Step = "initial" | "scanner" | "manual" | "color" | "name";

const TEAL = "#1B6B7A";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";
const BG = "#DDE4E7";

export function AddCardModal({ visible, onClose, onSave }: AddCardModalProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("initial");
  const [barcode, setBarcode] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState("");
  const [selectedColor, setSelectedColor] = useState("#FF6B6B");
  const [cardName, setCardName] = useState("");
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible && step === "scanner") {
      requestCameraPermission();
    }
  }, [visible, step]);

  const requestCameraPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === "granted");
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Camera permission is required to scan barcodes");
    }
  };

  const handleBarcodeScan = ({ data }: { data: string; type: string }) => {
    if (!scanned) {
      setScanned(true);
      setBarcode(data);
      // Move to color selection
      setTimeout(() => setStep("color"), 500);
    }
  };

  const handleManualEntry = () => {
    if (!manualBarcode.trim()) {
      Alert.alert("Error", "Please enter a barcode");
      return;
    }
    setBarcode(manualBarcode);
    setStep("color");
  };

  const handleSaveCard = () => {
    if (!cardName.trim() || !barcode) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    const newCard: StoreCard = {
      id: Date.now().toString(),
      barcode,
      name: cardName.trim(),
      color: selectedColor,
      createdAt: new Date().toISOString(),
    };

    onSave(newCard);
    resetModal();
  };

  const resetModal = () => {
    setStep("initial");
    setBarcode(null);
    setManualBarcode("");
    setSelectedColor("#FF6B6B");
    setCardName("");
    setScanned(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
          {/* Initial Screen */}
          {step === "initial" && (
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <View
                style={{
                  backgroundColor: "#fff",
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  paddingTop: 24,
                  paddingHorizontal: 20,
                  paddingBottom: 20 + insets.bottom,
                }}
              >
                <TouchableOpacity
                  onPress={resetModal}
                  style={{ position: "absolute", top: 16, right: 16 }}
                >
                  <Ionicons name="close" size={24} color={TEXT} />
                </TouchableOpacity>

                <Text style={{ fontSize: 20, fontWeight: "700", color: TEXT, marginBottom: 8 }}>
                  Add Loyalty Card
                </Text>
                <Text style={{ fontSize: 14, color: MUTED, marginBottom: 24, lineHeight: 20 }}>
                  Find the barcode on the back of your loyalty card and scan it, or enter it manually.
                </Text>

                <TouchableOpacity
                  onPress={() => {
                    setScanned(false);
                    setStep("scanner");
                  }}
                  style={{
                    backgroundColor: TEAL,
                    paddingVertical: 16,
                    borderRadius: 12,
                    alignItems: "center",
                    marginBottom: 12,
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons name="scan" size={20} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Scan Barcode</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setStep("manual")}
                  style={{
                    borderWidth: 2,
                    borderColor: TEAL,
                    paddingVertical: 16,
                    borderRadius: 12,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons name="keypad" size={20} color={TEAL} />
                  <Text style={{ color: TEAL, fontWeight: "600", fontSize: 16 }}>Enter Manually</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Scanner Screen */}
          {step === "scanner" && (
            <View style={{ flex: 1 }}>
              {hasPermission === null ? (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                  <ActivityIndicator size="large" color={TEAL} />
                </View>
              ) : hasPermission ? (
                <>
                  <CameraView
                    onBarcodeScanned={handleBarcodeScan}
                    barcodeScannerSettings={{
                      barcodeTypes: ["ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "qr"],
                    }}
                    style={{ flex: 1 }}
                  />
                  <View
                    style={{
                      position: "absolute",
                      top: insets.top + 16,
                      left: 16,
                      backgroundColor: "rgba(0,0,0,0.6)",
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    <TouchableOpacity onPress={() => setStep("initial")}>
                      <Ionicons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  <View
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      backgroundColor: "rgba(0,0,0,0.8)",
                      padding: 20,
                      paddingBottom: 20 + insets.bottom,
                    }}
                  >
                    <Text style={{ color: "#fff", textAlign: "center", fontSize: 14 }}>
                      Point your camera at the barcode
                    </Text>
                  </View>
                </>
              ) : (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
                  <Ionicons name="alert-circle" size={48} color={TEAL} />
                  <Text style={{ fontSize: 16, fontWeight: "600", color: TEXT, marginTop: 16, textAlign: "center" }}>
                    Camera Permission Required
                  </Text>
                  <Text style={{ fontSize: 14, color: MUTED, marginTop: 8, textAlign: "center" }}>
                    Please enable camera access in your device settings
                  </Text>
                  <TouchableOpacity
                    onPress={() => setStep("initial")}
                    style={{
                      marginTop: 24,
                      backgroundColor: TEAL,
                      paddingVertical: 12,
                      paddingHorizontal: 24,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "600" }}>Go Back</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Manual Entry Screen */}
          {step === "manual" && (
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <View
                style={{
                  backgroundColor: "#fff",
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  padding: 20,
                  paddingBottom: 20 + insets.bottom,
                }}
              >
                <TouchableOpacity
                  onPress={() => setStep("initial")}
                  style={{ marginBottom: 16 }}
                >
                  <Ionicons name="arrow-back" size={24} color={TEXT} />
                </TouchableOpacity>

                <Text style={{ fontSize: 20, fontWeight: "700", color: TEXT, marginBottom: 8 }}>
                  Enter Barcode Manual
                </Text>
                <Text style={{ fontSize: 14, color: MUTED, marginBottom: 20 }}>
                  Type the barcode number from the back of your card
                </Text>

                <TextInput
                  placeholder="Barcode number"
                  value={manualBarcode}
                  onChangeText={setManualBarcode}
                  placeholderTextColor={MUTED}
                  style={{
                    borderWidth: 1,
                    borderColor: BORDER,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    fontSize: 16,
                    marginBottom: 20,
                  }}
                  keyboardType="number-pad"
                />

                <TouchableOpacity
                  onPress={handleManualEntry}
                  style={{
                    backgroundColor: TEAL,
                    paddingVertical: 14,
                    borderRadius: 8,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Next</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Color Selection Screen */}
          {step === "color" && (
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <ScrollView
                style={{
                  backgroundColor: "#fff",
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                }}
                contentContainerStyle={{ padding: 20 }}
              >
                <TouchableOpacity
                  onPress={() => setStep("initial")}
                  style={{ marginBottom: 16 }}
                >
                  <Ionicons name="arrow-back" size={24} color={TEXT} />
                </TouchableOpacity>

                <Text style={{ fontSize: 20, fontWeight: "700", color: TEXT, marginBottom: 8 }}>
                  Choose Card Color
                </Text>
                <Text style={{ fontSize: 14, color: MUTED, marginBottom: 20 }}>
                  Select the color of your loyalty card
                </Text>

                <ColorSelector
                  selectedColor={selectedColor}
                  onColorSelect={setSelectedColor}
                />

                <TouchableOpacity
                  onPress={() => setStep("name")}
                  style={{
                    backgroundColor: TEAL,
                    paddingVertical: 14,
                    borderRadius: 8,
                    alignItems: "center",
                    marginTop: 24,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Next</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}

          {/* Name Input Screen */}
          {step === "name" && (
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <View
                style={{
                  backgroundColor: "#fff",
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  padding: 20,
                  paddingBottom: 20 + insets.bottom,
                }}
              >
                <TouchableOpacity
                  onPress={() => setStep("color")}
                  style={{ marginBottom: 16 }}
                >
                  <Ionicons name="arrow-back" size={24} color={TEXT} />
                </TouchableOpacity>

                <Text style={{ fontSize: 20, fontWeight: "700", color: TEXT, marginBottom: 8 }}>
                  Card Name
                </Text>
                <Text style={{ fontSize: 14, color: MUTED, marginBottom: 20 }}>
                  Give your card a name (e.g., "Whole Foods", "Target")
                </Text>

                <TextInput
                  placeholder="E.g., Whole Foods"
                  value={cardName}
                  onChangeText={setCardName}
                  placeholderTextColor={MUTED}
                  autoFocus
                  style={{
                    borderWidth: 1,
                    borderColor: BORDER,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    fontSize: 16,
                    marginBottom: 20,
                  }}
                />

                <TouchableOpacity
                  onPress={handleSaveCard}
                  style={{
                    backgroundColor: TEAL,
                    paddingVertical: 14,
                    borderRadius: 8,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Save Card</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
