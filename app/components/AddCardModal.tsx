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
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, Camera } from "expo-camera";
import { ColorSelector } from "./ColorSelector";
import { ProgramPickerModal } from "./ProgramPickerModal";
import { detectProgram, type LoyaltyProgram } from "../lib/loyaltyPrograms";
import type { StoreCard } from "../lib/types";

interface AddCardModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (card: StoreCard) => void;
}

type Step = "initial" | "scanner" | "manual" | "program-confirm" | "color" | "name";

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
  const [detectedProgram, setDetectedProgram] = useState<LoyaltyProgram | null>(null);
  const [showProgramPicker, setShowProgramPicker] = useState(false);

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

  const handleBarcodeDetected = (data: string) => {
    setBarcode(data);
    const program = detectProgram(data);
    if (program) {
      setDetectedProgram(program);
      setCardName(program.name);
      setStep("program-confirm");
    } else {
      // No prefix match — show picker
      setDetectedProgram(null);
      setShowProgramPicker(true);
    }
  };

  const handleBarcodeScan = ({ data }: { data: string; type: string }) => {
    if (!scanned) {
      setScanned(true);
      setTimeout(() => handleBarcodeDetected(data), 300);
    }
  };

  const handleManualEntry = () => {
    if (!manualBarcode.trim()) {
      Alert.alert("Error", "Please enter a barcode");
      return;
    }
    handleBarcodeDetected(manualBarcode);
  };

  const handleProgramSelected = (program: LoyaltyProgram) => {
    setDetectedProgram(program);
    setCardName(program.name);
    setShowProgramPicker(false);
    setStep("color");
  };

  const handleProgramSkipped = () => {
    setDetectedProgram(null);
    setShowProgramPicker(false);
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
      programId: detectedProgram?.id,
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
    setDetectedProgram(null);
    setShowProgramPicker(false);
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
            <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }} edges={["top"]}>
              {hasPermission === null ? (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                  <ActivityIndicator size="large" color={TEAL} />
                </View>
              ) : hasPermission ? (
                <>
                  {/* Header — in normal flow, ABOVE the camera. SafeAreaView above guarantees it clears the Dynamic Island */}
                  <View style={{ backgroundColor: "rgba(0,0,0,0.85)", flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 12 }}>
                    <TouchableOpacity
                      onPress={() => setStep("initial")}
                      style={{ padding: 8, minWidth: 44, alignItems: "flex-start" }}
                    >
                      <Ionicons name="chevron-back" size={28} color="#fff" />
                    </TouchableOpacity>
                    <Text style={{ flex: 1, color: "#fff", fontSize: 17, fontWeight: "600", textAlign: "center" }}>
                      Scan Barcode
                    </Text>
                    <View style={{ minWidth: 44 }} />
                  </View>

                  {/* Camera + viewfinder — fills remaining space */}
                  <View style={{ flex: 1 }}>
                    <CameraView
                      onBarcodeScanned={handleBarcodeScan}
                      barcodeScannerSettings={{
                        barcodeTypes: ["ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "qr"],
                      }}
                      style={{ flex: 1 }}
                    />

                    {/* Viewfinder overlay */}
                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
                      {/* Top dark hint */}
                      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end", paddingBottom: 16, paddingHorizontal: 24 }}>
                        <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, textAlign: "center" }}>
                          Find the barcode on the back of your loyalty card
                        </Text>
                      </View>

                      {/* Middle row: left mask | clear window | right mask */}
                      <View style={{ height: 120, flexDirection: "row" }}>
                        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} />
                        <View style={{ width: 280 }}>
                          <View style={{ position: "absolute", top: 0, left: 0, width: 24, height: 24, borderTopWidth: 3, borderLeftWidth: 3, borderColor: "#fff", borderTopLeftRadius: 4 }} />
                          <View style={{ position: "absolute", top: 0, right: 0, width: 24, height: 24, borderTopWidth: 3, borderRightWidth: 3, borderColor: "#fff", borderTopRightRadius: 4 }} />
                          <View style={{ position: "absolute", bottom: 0, left: 0, width: 24, height: 24, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: "#fff", borderBottomLeftRadius: 4 }} />
                          <View style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderBottomWidth: 3, borderRightWidth: 3, borderColor: "#fff", borderBottomRightRadius: 4 }} />
                        </View>
                        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} />
                      </View>

                      {/* Bottom instructions */}
                      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", paddingTop: 24, paddingHorizontal: 32, paddingBottom: insets.bottom }}>
                        <Ionicons name="barcode-outline" size={32} color="rgba(255,255,255,0.5)" />
                        <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600", textAlign: "center", marginTop: 12 }}>
                          Align the barcode within the frame
                        </Text>
                        <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, textAlign: "center", marginTop: 6, lineHeight: 18 }}>
                          Hold steady — scanning happens automatically.{"\n"}Supports EAN, Code128, QR, and more.
                        </Text>
                      </View>
                    </View>
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
            </SafeAreaView>
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
                  <Ionicons name="chevron-back" size={24} color={TEXT} />
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

          {/* Program Confirmation Screen — shown when a program is auto-detected by prefix */}
          {step === "program-confirm" && detectedProgram && (
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <View
                style={{
                  backgroundColor: "#fff",
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  padding: 20,
                  paddingBottom: 20 + insets.bottom,
                  alignItems: "center",
                }}
              >
                <TouchableOpacity
                  onPress={() => setStep("initial")}
                  style={{ position: "absolute", top: 20, left: 16 }}
                >
                  <Ionicons name="chevron-back" size={24} color={TEXT} />
                </TouchableOpacity>

                <Text style={{ fontSize: 20, fontWeight: "700", color: TEXT, marginBottom: 4, marginTop: 8 }}>
                  Program Detected
                </Text>
                <Text style={{ fontSize: 14, color: MUTED, marginBottom: 28, textAlign: "center" }}>
                  We recognised this card
                </Text>

                {/* Logo */}
                {detectedProgram.logo ? (
                  <Image
                    source={detectedProgram.logo}
                    style={{ width: 100, height: 100, borderRadius: 16, marginBottom: 16 }}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={{ width: 100, height: 100, borderRadius: 16, backgroundColor: BG, justifyContent: "center", alignItems: "center", marginBottom: 16 }}>
                    <Ionicons name="card" size={48} color={TEAL} />
                  </View>
                )}

                <Text style={{ fontSize: 22, fontWeight: "700", color: TEXT, marginBottom: 8, textAlign: "center" }}>
                  {detectedProgram.name}
                </Text>

                <TouchableOpacity
                  onPress={() => setStep("color")}
                  style={{
                    backgroundColor: TEAL,
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    width: "100%",
                    marginTop: 16,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Yes, that's my card</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setShowProgramPicker(true)}
                  style={{
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    width: "100%",
                    marginTop: 8,
                  }}
                >
                  <Text style={{ color: TEAL, fontWeight: "600", fontSize: 15 }}>Change program</Text>
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
                  maxHeight: "80%",
                }}
                contentContainerStyle={{ padding: 20, paddingBottom: 20 + insets.bottom }}
              >
                <TouchableOpacity
                  onPress={() => setStep(detectedProgram ? "program-confirm" : "initial")}
                  style={{ marginBottom: 16 }}
                >
                  <Ionicons name="chevron-back" size={24} color={TEXT} />
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
                  <Ionicons name="chevron-back" size={24} color={TEXT} />
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

      {/* Program Picker — shown when no prefix match, or user wants to change */}
      <ProgramPickerModal
        visible={showProgramPicker}
        onSelect={handleProgramSelected}
        onSkip={handleProgramSkipped}
        onClose={() => {
          setShowProgramPicker(false);
          // If we arrived here from scan with no match, go back to initial
          if (step !== "program-confirm") setStep("initial");
        }}
      />
    </Modal>
  );
}
