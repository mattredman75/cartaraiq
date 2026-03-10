import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { searchProducts } from "../../../lib/api";
import { COLORS } from "../../../lib/constants";

interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  unit: string;
  category: string;
  emoji: string;
  ai_tag: string;
}

const CATEGORIES = [
  "All",
  "Produce",
  "Dairy",
  "Meat",
  "Bakery",
  "Pantry",
  "Beverages",
];

export default function ProductsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["products", query],
    queryFn: async () => (await searchProducts(query)).data,
    staleTime: 30000,
  });

  const filtered =
    activeCategory === "All"
      ? products
      : products.filter((p) => p.category === activeCategory);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View
          style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 }}
        >
          <Text
            style={{
              fontFamily: "Montserrat_700Bold",
              fontSize: 28,
              color: COLORS.ink,
              marginBottom: 16,
            }}
          >
            Discover
          </Text>

          {/* Search bar */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: COLORS.card,
              borderWidth: 1.5,
              borderColor: COLORS.border,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{ fontSize: 18, marginRight: 10, color: COLORS.muted }}
            >
              🔍
            </Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search products..."
              placeholderTextColor={COLORS.muted}
              returnKeyType="search"
              style={{
                flex: 1,
                fontFamily: "Montserrat_400Regular",
                fontSize: 15,
                color: COLORS.ink,
                paddingVertical: 13,
              }}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")}>
                <Text style={{ color: COLORS.muted, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Category pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 16,
            gap: 8,
          }}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => setActiveCategory(cat)}
              activeOpacity={0.7}
              style={{
                backgroundColor:
                  activeCategory === cat ? COLORS.teal : COLORS.card,
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderWidth: 1.5,
                borderColor:
                  activeCategory === cat ? COLORS.teal : COLORS.border,
              }}
            >
              <Text
                style={{
                  fontFamily: "Montserrat_600SemiBold",
                  fontSize: 13,
                  color: activeCategory === cat ? "#fff" : COLORS.muted,
                }}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Results */}
        {isLoading ? (
          <ActivityIndicator color={COLORS.teal} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
          >
            {filtered.length === 0 ? (
              <View style={{ alignItems: "center", paddingTop: 60 }}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>🔍</Text>
                <Text
                  style={{
                    fontFamily: "Montserrat_600SemiBold",
                    fontSize: 16,
                    color: COLORS.ink,
                  }}
                >
                  No results found
                </Text>
              </View>
            ) : (
              <>
                <Text
                  style={{
                    fontFamily: "Montserrat_600SemiBold",
                    fontSize: 12,
                    color: COLORS.muted,
                    letterSpacing: 0.8,
                    marginBottom: 14,
                  }}
                >
                  {filtered.length} PRODUCTS
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  {filtered.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onPress={() =>
                        router.push(`/(app)/products/${product.id}`)
                      }
                    />
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

function ProductCard({
  product,
  onPress,
}: {
  product: Product;
  onPress: () => void;
}) {
  const cardWidth = "47.5%";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        width: cardWidth,
        backgroundColor: COLORS.card,
        borderRadius: 4,
        padding: 16,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.16,
        shadowRadius: 4,
        elevation: 4,
      }}
    >
      {/* AI tag */}
      <View
        style={{
          alignSelf: "flex-start",
          backgroundColor: COLORS.cyan + "18",
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 20,
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            fontFamily: "Montserrat_600SemiBold",
            fontSize: 10,
            color: COLORS.teal,
            letterSpacing: 0.5,
          }}
        >
          {product.ai_tag}
        </Text>
      </View>

      {/* Emoji */}
      <Text style={{ fontSize: 36, marginBottom: 10 }}>{product.emoji}</Text>

      {/* Name */}
      <Text
        style={{
          fontFamily: "Montserrat_600SemiBold",
          fontSize: 14,
          color: COLORS.ink,
          marginBottom: 4,
          lineHeight: 20,
        }}
        numberOfLines={2}
      >
        {product.name}
      </Text>

      {/* Brand */}
      <Text
        style={{
          fontFamily: "Montserrat_400Regular",
          fontSize: 12,
          color: COLORS.muted,
          marginBottom: 12,
        }}
      >
        {product.brand}
      </Text>

      {/* Price + unit */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <Text
          style={{
            fontFamily: "Montserrat_700Bold",
            fontSize: 16,
            color: COLORS.teal,
          }}
        >
          ${product.price.toFixed(2)}
        </Text>
        <Text
          style={{
            fontFamily: "Montserrat_400Regular",
            fontSize: 11,
            color: COLORS.muted,
          }}
        >
          {product.unit}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
