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
        height: 70,
        margin: 8,
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

            {/* Card with barcode overlaid */}
            <View
              style={{
                width: "100%",
                height: 220,
                borderRadius: 20,
                overflow: "hidden",
                marginTop: 8,
                marginBottom: 20,
              }}
            >
              {/* Card background */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: card.color,
                  padding: 20,
                  justifyContent: "space-between",
                }}
              >
                {/* Card name at top */}
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: "#fff",
                  }}
                >
                  {card.name}
                </Text>

                {/* Barcode centered on card */}
                <View
                  style={{
                    backgroundColor: "rgba(255,255,255,0.95)",
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    alignItems: "center",
                  }}
                >
                  {barcodeSvg ? (
                    <SvgXml xml={barcodeSvg} width="100%" height={90} />
                  ) : (
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "700",
                        color: TEXT,
                        letterSpacing: 2,
                        paddingVertical: 20,
                      }}
                    >
                      {card.barcode}
                    </Text>
                  )}
                </View>
              </View>
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
