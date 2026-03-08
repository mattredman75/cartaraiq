import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getItem, setItem } from "../../lib/storage";
import type { StoreCard } from "../../lib/types";
import { StoreCardItem } from "../../components/StoreCardItem";
import { AddCardModal } from "../../components/AddCardModal";
import { BarcodeDisplayModal } from "../../components/BarcodeDisplayModal";
import { EditCardModal } from "../../components/EditCardModal";

const TEAL = "#1B6B7A";
const TEAL_DARK = "#0D4F5C";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";
const BG = "#DDE4E7";

export default function PantryScreen() {
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<StoreCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<StoreCard | null>(null);

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    try {
      const stored = await getItem("store_cards");
      if (stored) {
        setCards(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load cards:", e);
    } finally {
      setLoading(false);
    }
  };

  const saveCards = async (updatedCards: StoreCard[]) => {
    try {
      await setItem("store_cards", JSON.stringify(updatedCards));
      setCards(updatedCards);
    } catch (e) {
      console.error("Failed to save cards:", e);
      Alert.alert("Error", "Failed to save card");
    }
  };

  const handleAddCard = (card: StoreCard) => {
    const updatedCards = [...cards, card];
    saveCards(updatedCards);
    setShowAddModal(false);
  };

  const handleEditCard = (updatedCard: StoreCard) => {
    const updatedCards = cards.map((c) => (c.id === updatedCard.id ? updatedCard : c));
    saveCards(updatedCards);
    setShowEditModal(false);
    setSelectedCard(null);
  };

  const handleDeleteCard = (id: string) => {
    Alert.alert("Delete Card", "Are you sure you want to delete this card?", [
      { text: "Cancel" },
      {
        text: "Delete",
        onPress: () => {
          const updatedCards = cards.filter((c) => c.id !== id);
          saveCards(updatedCards);
          setSelectedCard(null);
        },
        style: "destructive",
      },
    ]);
  };

  const handleCardPress = (card: StoreCard) => {
    setSelectedCard(card);
    setShowBarcodeModal(true);
  };

  const handleCardLongPress = (card: StoreCard) => {
    setSelectedCard(card);
    setShowEditModal(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={["right", "left"]}>
      <View style={{ flex: 1, paddingTop: insets.top }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 28, fontWeight: "700", color: TEXT }}>Loyalty Cards</Text>
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: TEAL,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
              gap: 6,
            }}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Add Card</Text>
          </TouchableOpacity>
        </View>

        {/* Cards Carousel */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: MUTED }}>Loading cards...</Text>
          </View>
        ) : cards.length === 0 ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
            <View
              style={{
                width: 280,
                height: 160,
                borderWidth: 2,
                borderStyle: "dashed",
                borderColor: MUTED,
                borderRadius: 16,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "600", color: MUTED }}>No Cards</Text>
              <Text style={{ fontSize: 13, color: MUTED, marginTop: 8 }}>Add your first loyalty card</Text>
            </View>
          </View>
        ) : (
          <FlatList
            data={cards}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, gap: 12 }}
            renderItem={({ item }) => (
              <StoreCardItem
                card={item}
                onPress={() => handleCardPress(item)}
                onLongPress={() => handleCardLongPress(item)}
              />
            )}
          />
        )}
      </View>

      {/* Modals */}
      <AddCardModal visible={showAddModal} onClose={() => setShowAddModal(false)} onSave={handleAddCard} />

      {selectedCard && (
        <>
          <BarcodeDisplayModal
            visible={showBarcodeModal}
            card={selectedCard}
            onClose={() => setShowBarcodeModal(false)}
            onEdit={() => {
              setShowBarcodeModal(false);
              setShowEditModal(true);
            }}
            onDelete={() => {
              setShowBarcodeModal(false);
              handleDeleteCard(selectedCard.id);
            }}
          />

          <EditCardModal
            visible={showEditModal}
            card={selectedCard}
            onClose={() => setShowEditModal(false)}
            onSave={handleEditCard}
          />
        </>
      )}
    </SafeAreaView>
  );
}
