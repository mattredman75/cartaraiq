import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  Alert,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getItem, setItem } from "../../lib/storage";
import type { StoreCard } from "../../lib/types";
import { StoreCardItem } from "../../components/StoreCardItem";
import { AddCardModal } from "../../components/AddCardModal";
import { BarcodeDisplayModal } from "../../components/BarcodeDisplayModal";
import { EditCardModal } from "../../components/EditCardModal";
import { useLoyaltyPrograms } from "../../hooks/useLoyaltyPrograms";
import { useAuthStore } from "../../lib/store";

const TEAL = "#1B6B7A";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BG = "#DDE4E7";

type GridItem = StoreCard | { id: "__add__" };

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_PADDING = 20;
const GRID_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;
const CARD_HEIGHT = Math.round(CARD_WIDTH * (160 / 280));

export default function PantryScreen() {
  const insets = useSafeAreaInsets();
  const { programs } = useLoyaltyPrograms();
  const user = useAuthStore((s) => s.user);
  const cardsKey = user ? `store_cards_${user.id}` : "store_cards";
  const [cards, setCards] = useState<StoreCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<StoreCard | null>(null);

  useEffect(() => {
    loadCards();
  }, [cardsKey]);

  const loadCards = async () => {
    try {
      const stored = await getItem(cardsKey);
      if (stored) {
        setCards(JSON.parse(stored));
      } else {
        setCards([]);
      }
    } catch (e) /* istanbul ignore next */ {
      console.error("Failed to load cards:", e);
    } finally {
      setLoading(false);
    }
  };

  const saveCards = async (updatedCards: StoreCard[]) => {
    try {
      await setItem(cardsKey, JSON.stringify(updatedCards));
      setCards(updatedCards);
    } catch (e) /* istanbul ignore next */ {
      console.error("Failed to save cards:", e);
      Alert.alert("Error", "Failed to save card");
    }
  };

  const handleAddCard = (card: StoreCard) => {
    const duplicate = cards.some((c) => c.barcode === card.barcode);
    if (duplicate) {
      Alert.alert("Already added", "You have already added this card.");
      return;
    }
    const updatedCards = [...cards, card];
    saveCards(updatedCards);
    // Modal close is handled by AddCardModal's resetModal → onClose()
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
        /* istanbul ignore next */
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
    // Matched/branded cards are not editable
    const program = card.programId
      ? programs.find((p) => p.id === card.programId || p.slug === card.programId)
      : null;
    if (program?.logo_url) return;
    setSelectedCard(card);
    setShowEditModal(true);
  };

  const gridData: GridItem[] = [...cards, { id: "__add__" }];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={["right", "left"]}>
      <View style={{ flex: 1, paddingTop: insets.top }}>
        {/* Header */}
        <View style={{ paddingHorizontal: GRID_PADDING, paddingVertical: 16 }}>
          <Text style={{ fontSize: 28, fontWeight: "700", color: TEXT }}>Loyalty Cards</Text>
        </View>

        {/* Card Grid */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: MUTED }}>Loading cards...</Text>
          </View>
        ) : (
          <FlatList<GridItem>
            data={gridData}
            keyExtractor={(item) => item.id}
            numColumns={2}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: GRID_PADDING, paddingBottom: 32, gap: GRID_GAP }}
            columnWrapperStyle={{ gap: GRID_GAP }}
            renderItem={({ item }) => {
              if (item.id === "__add__") {
                return (
                  <TouchableOpacity
                    onPress={() => setShowAddModal(true)}
                    activeOpacity={0.8}
                    style={{
                      width: CARD_WIDTH,
                      height: CARD_HEIGHT,
                      borderRadius: 16,
                      backgroundColor: "#E0F5F7",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: TEAL,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Ionicons name="add" size={24} color="#fff" />
                    </View>
                    <Text style={{ color: TEAL, fontWeight: "600", fontSize: 13 }}>Add new card</Text>
                  </TouchableOpacity>
                );
              }
              const card = item as StoreCard;
              return (
                <StoreCardItem
                  card={card}
                  cardWidth={CARD_WIDTH}
                  cardHeight={CARD_HEIGHT}
                  onPress={() => handleCardPress(card)}
                  onLongPress={() => handleCardLongPress(card)}
                />
              );
            }}
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
