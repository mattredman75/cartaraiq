import React, { useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Dimensions,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { SvgXml } from "react-native-svg";
import JsBarcode from "jsbarcode";
import { DOMImplementation, XMLSerializer } from "xmldom";
import type { StoreCard } from "../lib/types";
import { LOYALTY_PROGRAMS } from "../lib/loyaltyPrograms";

interface BarcodeDisplayModalProps {
  visible: boolean;
  card: StoreCard;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const TEAL = "#1B6B7A";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BG = "#DDE4E7";

export function BarcodeDisplayModal({
  visible,
  card,
  onClose,
  onEdit,
  onDelete,
}: BarcodeDisplayModalProps) {
  const insets = useSafeAreaInsets();
  const [barcodeSvg, setBarcodeSvg] = React.useState<string | null>(null);
  const cardWidth = Dimensions.get("window").width - 40;
  const cardHeight = 225;

  const program = card?.programId
    ? LOYALTY_PROGRAMS.find((p) => p.id === card.programId) ?? null
    : null;

  useEffect(() => {
    if (visible && card) {
      generateBarcode();
    }
  }, [visible, card]);

  const generateBarcode = () => {
    // jsbarcode internally references the global `document`, which doesn't exist
    // in React Native's Hermes engine. We temporarily polyfill it with an xmldom
    // document so jsbarcode can do its work, then restore the original value.
    const xmldomDoc = new DOMImplementation().createDocument(
      "http://www.w3.org/1999/xhtml",
      "html",
      null
    );
    const previousDocument = (global as any).document;
    (global as any).document = xmldomDoc;
    try {
      const svgNode = xmldomDoc.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      JsBarcode(svgNode, card.barcode, {
        format: "CODE128",
        width: 2,
        height: 75,
        margin: 6,
        displayValue: false,
        background: "transparent",
      });
      const svgString = new XMLSerializer().serializeToString(svgNode);
      setBarcodeSvg(svgString);
    } catch (e) {
      console.error("Failed to generate barcode:", e);
      setBarcodeSvg(null);
    } finally {
      (global as any).document = previousDocument;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 20,
              paddingTop: 40,
              paddingBottom: 20 + insets.bottom,
              alignItems: "center",
            }}
          >
            {/* Close Button */}
            <TouchableOpacity
              onPress={onClose}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                zIndex: 10,
              }}
            >
              <Ionicons name="close" size={24} color={TEXT} />
            </TouchableOpacity>

            {/* Card with barcode overlaid */}
            <View
              style={{
                width: "100%",
                height: cardHeight,
                borderRadius: 20,
                overflow: "hidden",
                marginTop: 8,
                marginBottom: 20,
              }}
            >
              {/* Card background */}
              <LinearGradient
                colors={[card.color, card.color + "CC"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0.5 }}
                style={{
                  flex: 1,
                  padding: 20,
                  gap: 12,
                }}
              >
                {/* Swoosh Effect - same proportions as StoreCardItem */}
                <View
                  style={{
                    position: "absolute",
                    width: cardWidth * 1.15,
                    height: cardHeight * 1.62,
                    borderRadius: 9999,
                    backgroundColor: "rgba(255,255,255,0.25)",
                    top: -cardHeight * 0.3,
                    right: -cardWidth * 0.1 + 15,
                    transform: [{ rotate: "-45deg" }],
                  }}
                />

                {/* Card name + logo at top */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", zIndex: 1 }}>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: "#fff",
                      flex: 1,
                      marginRight: program?.logo ? 8 : 0,
                    }}
                    numberOfLines={2}
                  >
                    {card.name}
                  </Text>
                  {program?.logo && (
                    <Image
                      source={program.logo}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        backgroundColor: "rgba(255,255,255,0.9)",
                      }}
                      resizeMode="contain"
                    />
                  )}
                </View>

                {/* Barcode */}
                <View
                  style={{
                    backgroundColor: "rgba(255,255,255,0.95)",
                    borderRadius: 12,
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    alignItems: "center",
                    zIndex: 1,
                  }}
                >
                  {barcodeSvg ? (
                    <>
                      <SvgXml xml={barcodeSvg} width="100%" height={100} />
                      <Text
                        style={{
                          fontSize: 11,
                          color: MUTED,
                          letterSpacing: 2,
                          marginTop: 2,
                          fontWeight: "500",
                        }}
                      >
                        {card.barcode}
                      </Text>
                    </>
                  ) : (
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "700",
                        color: TEXT,
                        letterSpacing: 2,
                        paddingVertical: 16,
                      }}
                    >
                      {card.barcode}
                    </Text>
                  )}
                </View>
              </LinearGradient>
            </View>

            {/* Spacer */}
            <View style={{ marginBottom: 20 }} />

            {/* Action Buttons */}
            <View style={{ width: "100%", gap: 12 }}>
              <TouchableOpacity
                onPress={onEdit}
                style={{
                  backgroundColor: TEAL,
                  paddingVertical: 14,
                  borderRadius: 8,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="pencil" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
                  Edit Card
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onDelete}
                style={{
                  backgroundColor: "#FFE4E1",
                  paddingVertical: 14,
                  borderRadius: 8,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="trash" size={18} color="#FF6B6B" />
                <Text style={{ color: "#FF6B6B", fontWeight: "600", fontSize: 16 }}>
                  Delete Card
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
