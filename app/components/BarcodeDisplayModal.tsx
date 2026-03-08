import React, { useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";
import JsBarcode from "jsbarcode";
import { DOMImplementation, XMLSerializer } from "xmldom";
import type { StoreCard } from "../lib/types";

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

  useEffect(() => {
    if (visible && card) {
      generateBarcode();
    }
  }, [visible, card]);

  const generateBarcode = () => {
    try {
      const document = new DOMImplementation().createDocument(
        "http://www.w3.org/1999/xhtml",
        "html",
        null
      );
      const svgNode = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      JsBarcode(svgNode, card.barcode, {
        format: "CODE128",
        width: 2,
        height: 80,
        margin: 10,
        displayValue: true,
        fontSize: 14,
        fontOptions: "bold",
        background: "#f5f5f5",
      });
      const svgString = new XMLSerializer().serializeToString(svgNode);
      setBarcodeSvg(svgString);
    } catch (e) {
      console.error("Failed to generate barcode:", e);
      setBarcodeSvg(null);
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
              paddingTop: 20,
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

            {/* Card Preview */}
            <View
              style={{
                width: "100%",
                maxWidth: 300,
                height: 180,
                borderRadius: 16,
                marginBottom: 28,
                overflow: "hidden",
                marginTop: 8,
              }}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: card.color,
                  justifyContent: "space-between",
                  padding: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.7)",
                    fontWeight: "600",
                  }}
                >
                  LOYALTY CARD
                </Text>
                <View>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "700",
                      color: "#fff",
                    }}
                  >
                    {card.name}
                  </Text>
                </View>
              </View>
            </View>

            {/* Barcode */}
            <View
              style={{
                backgroundColor: "#f5f5f5",
                padding: 16,
                borderRadius: 12,
                marginBottom: 24,
                width: "100%",
                alignItems: "center",
              }}
            >
              {barcodeSvg ? (
                <SvgXml
                  xml={barcodeSvg}
                  width="100%"
                  height={120}
                />
              ) : (
                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: "700",
                      color: TEXT,
                      letterSpacing: 2,
                      marginBottom: 8,
                    }}
                  >
                    {card.barcode}
                  </Text>
                  <Text style={{ fontSize: 11, color: MUTED }}>
                    Barcode #{card.barcode}
                  </Text>
                </View>
              )}
            </View>

            {/* Scan Instruction */}
            <Text
              style={{
                fontSize: 13,
                color: MUTED,
                textAlign: "center",
                marginBottom: 20,
                fontStyle: "italic",
              }}
            >
              Show this barcode to the cashier
            </Text>

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
