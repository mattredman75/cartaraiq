import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Alert,
  Modal,
  RefreshControl,
  Animated,
  PanResponder,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchARRecipeSearch,
  fetchARRecipeDetail,
  heartRecipe,
  unheartRecipe,
  fetchHeartedRecipes,
  addListItem,
  fetchListItems,
  fetchShoppingLists,
} from "../../lib/api";
import { useListStore } from "../../lib/store";
import { COLORS } from "../../lib/constants";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecipeNutrition {
  calories?: string;
  protein?: string;
  fat?: string;
  carbohydrate?: string;
}

interface RecipeIngredient {
  name: string;
}

interface Recipe {
  id: string;
  name: string;
  description: string;
  image_url?: string | null;
  recipe_types: string[];
  ingredients: RecipeIngredient[];
  nutrition?: RecipeNutrition | null;
  total_mins?: number | null;
  servings?: number | null;
  heart_count?: number;
  is_hearted?: boolean;
}

interface RecipeDetail extends Recipe {
  directions: string[];
  prep_mins?: number | null;
  cook_mins?: number | null;
  total_mins?: number | null;
  servings?: number | null;
  heart_count?: number;
  is_hearted?: boolean;
}

interface ShoppingList {
  id: string;
  name: string;
}

// ── Category config ───────────────────────────────────────────────────────────

type Category = "favorites" | "breakfast" | "lunch" | "dinner" | "dessert";

const CATEGORIES: {
  key: Category;
  label: string;
  icon: string;
  headline: string;
  sub: string;
  gradient: readonly [string, string, string];
}[] = [
  {
    key: "favorites",
    label: "Favorites",
    icon: "heart",
    headline: "Your favorites",
    sub: "Recipes you've loved",
    gradient: [COLORS.teal, COLORS.tealDark, "#062F38"] as const,
  },
  {
    key: "breakfast",
    label: "Breakfast",
    icon: "sunny-outline",
    headline: "Good morning!",
    sub: "Start your day right",
    gradient: [COLORS.teal, COLORS.tealDark, "#062F38"] as const,
  },
  {
    key: "lunch",
    label: "Lunch",
    icon: "restaurant-outline",
    headline: "Lunchtime",
    sub: "Midday meal ideas",
    gradient: [COLORS.teal, COLORS.tealDark, "#062F38"] as const,
  },
  {
    key: "dinner",
    label: "Dinner",
    icon: "moon-outline",
    headline: "Tonight's dinner",
    sub: "End the day deliciously",
    gradient: [COLORS.teal, COLORS.tealDark, "#062F38"] as const,
  },
  {
    key: "dessert",
    label: "Dessert",
    icon: "ice-cream-outline",
    headline: "Treat yourself",
    sub: "Life is sweet",
    gradient: [COLORS.teal, COLORS.tealDark, "#062F38"] as const,
  },
];

function getInitialCategory(): Category {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 15) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "dessert";
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CARD_W = SCREEN_W - 32;
const HERO_H = 220;

// ── Heart button with swell + starburst animation ─────────────────────────────

const BURST_ANGLES = [0, 60, 120, 180, 240, 300].map(
  (d) => (d * Math.PI) / 180,
);
const BURST_RADIUS = 16;

function HeartButton({
  isHearted,
  size = 18,
  onPress,
}: {
  isHearted: boolean;
  size?: number;
  onPress: () => void;
}) {
  const heartScale = React.useRef(new Animated.Value(1)).current;
  const burstAnim = React.useRef(new Animated.Value(0)).current;

  const handlePress = () => {
    burstAnim.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.spring(heartScale, {
          toValue: 1.55,
          useNativeDriver: true,
          speed: 40,
          bounciness: 0,
        }),
        Animated.spring(heartScale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 20,
          bounciness: 8,
        }),
      ]),
      Animated.timing(burstAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
      <View
        style={{
          backgroundColor: "rgba(0,0,0,0.38)",
          borderRadius: 22,
          padding: 8,
          alignItems: "center",
          justifyContent: "center",
          overflow: "visible",
        }}
      >
        {BURST_ANGLES.map((angle, i) => {
          const tx = burstAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, Math.cos(angle) * BURST_RADIUS],
          });
          const ty = burstAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, Math.sin(angle) * BURST_RADIUS],
          });
          const opacity = burstAnim.interpolate({
            inputRange: [0, 0.1, 0.65, 1],
            outputRange: [0, 1, 0.45, 0],
          });
          const dotScale = burstAnim.interpolate({
            inputRange: [0, 0.2, 0.75, 1],
            outputRange: [0, 1, 0.6, 0],
          });
          return (
            <Animated.View
              key={i}
              style={{
                position: "absolute",
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: "#FF6B6B",
                opacity,
                transform: [
                  { translateX: tx },
                  { translateY: ty },
                  { scale: dotScale },
                ],
              }}
            />
          );
        })}
        <Animated.View style={{ transform: [{ scale: heartScale }] }}>
          <Ionicons
            name={isHearted ? "heart" : "heart-outline"}
            size={size}
            color={isHearted ? "#FF6B6B" : "#fff"}
          />
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}

// ── Nutrition badge ───────────────────────────────────────────────────────────

function NutriBadge({
  label,
  value,
  color,
}: {
  label: string;
  value?: string;
  color: string;
}) {
  if (!value) return null;
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontSize: 15, fontWeight: "700", color }}>{value}</Text>
      <Text
        style={{
          fontSize: 10,
          color: COLORS.muted,
          marginTop: 1,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ── Recipe card ───────────────────────────────────────────────────────────────

function RecipeCard({
  recipe,
  onAddToList,
  onViewDetail,
}: {
  recipe: Recipe;
  onAddToList: (recipe: Recipe) => void;
  onViewDetail: (recipe: Recipe) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isHearted, setIsHearted] = useState(recipe.is_hearted ?? false);
  const [heartCount, setHeartCount] = useState(recipe.heart_count ?? 0);
  const qc = useQueryClient();
  const heartMutation = useMutation({
    mutationFn: (hearted: boolean) =>
      hearted ? unheartRecipe(recipe.id) : heartRecipe(recipe.id),
    onMutate: (hearted: boolean) => {
      setIsHearted(!hearted);
      setHeartCount((c) => (hearted ? c - 1 : c + 1));
      if (hearted) {
        // Optimistically remove from Favorites list immediately
        const prevFavs = qc.getQueryData<Recipe[]>(["arRecipeHearts"]);
        qc.setQueryData<Recipe[]>(
          ["arRecipeHearts"],
          (old) => old?.filter((r) => r.id !== recipe.id) ?? [],
        );
        return { prevFavs };
      }
    },
    onError: (_err: unknown, hearted: boolean, context: any) => {
      setIsHearted(hearted);
      setHeartCount((c) => (hearted ? c + 1 : c - 1));
      if (hearted && context?.prevFavs) {
        qc.setQueryData(["arRecipeHearts"], context.prevFavs);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["arRecipeHearts"] }),
  });
  const toggleHeart = () => heartMutation.mutate(isHearted);

  return (
    <View
      style={{
        width: CARD_W,
        backgroundColor: "#fff",
        borderRadius: 20,
        marginBottom: 20,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      }}
    >
      {/* Hero image — tappable to open full detail */}
      {recipe.image_url ? (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => onViewDetail(recipe)}
        >
          <View style={{ width: CARD_W, height: HERO_H }}>
            <Image
              source={{ uri: recipe.image_url }}
              style={{ width: CARD_W, height: HERO_H }}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.7)"]}
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 110,
                justifyContent: "flex-end",
                padding: 14,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontWeight: "800",
                  fontSize: 18,
                  lineHeight: 23,
                }}
                numberOfLines={2}
              >
                {recipe.name}
              </Text>
            </LinearGradient>
            {/* Heart button — top left */}
            <View
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                zIndex: 10,
              }}
            >
              <HeartButton
                isHearted={isHearted}
                size={16}
                onPress={toggleHeart}
              />
            </View>
            {/* Expand hint — top right */}
            <View
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                backgroundColor: "rgba(0,0,0,0.35)",
                borderRadius: 20,
                padding: 6,
              }}
              pointerEvents="none"
            >
              <Ionicons name="expand-outline" size={16} color="#fff" />
            </View>
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => onViewDetail(recipe)}
        >
          <LinearGradient
            colors={[COLORS.teal, COLORS.tealDark]}
            style={{
              width: CARD_W,
              height: 90,
              justifyContent: "flex-end",
              padding: 14,
            }}
          >
            <Text
              style={{ color: "#fff", fontWeight: "800", fontSize: 18 }}
              numberOfLines={2}
            >
              {recipe.name}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Body */}
      <View style={{ padding: 16 }}>
        {!!recipe.description && (
          <Text
            style={{
              color: COLORS.muted,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: 14,
            }}
            numberOfLines={3}
          >
            {recipe.description}
          </Text>
        )}

        {/* Nutrition row */}
        {recipe.nutrition && (
          <View
            style={{
              flexDirection: "row",
              backgroundColor: COLORS.surface,
              borderRadius: 12,
              paddingVertical: 12,
              marginBottom: 14,
            }}
          >
            <NutriBadge
              label="Calories"
              value={recipe.nutrition.calories}
              color={COLORS.ink}
            />
            <View style={{ width: 1, backgroundColor: COLORS.border }} />
            <NutriBadge
              label="Protein"
              value={
                recipe.nutrition.protein
                  ? `${recipe.nutrition.protein}g`
                  : undefined
              }
              color="#10B981"
            />
            <View style={{ width: 1, backgroundColor: COLORS.border }} />
            <NutriBadge
              label="Carbs"
              value={
                recipe.nutrition.carbohydrate
                  ? `${recipe.nutrition.carbohydrate}g`
                  : undefined
              }
              color="#F59E0B"
            />
            <View style={{ width: 1, backgroundColor: COLORS.border }} />
            <NutriBadge
              label="Fat"
              value={
                recipe.nutrition.fat ? `${recipe.nutrition.fat}g` : undefined
              }
              color="#EF4444"
            />
          </View>
        )}

        {/* Ingredients toggle */}
        <TouchableOpacity
          onPress={() => setExpanded((e) => !e)}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingVertical: 10,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
          }}
          activeOpacity={0.7}
        >
          <Text style={{ fontWeight: "700", fontSize: 14, color: COLORS.ink }}>
            Ingredients ({recipe.ingredients.length})
          </Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={COLORS.muted}
          />
        </TouchableOpacity>

        {expanded && (
          <View style={{ paddingBottom: 8 }}>
            {recipe.ingredients.map((ing, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  paddingVertical: 5,
                  borderBottomWidth: i < recipe.ingredients.length - 1 ? 1 : 0,
                  borderBottomColor: COLORS.border,
                  gap: 10,
                }}
              >
                <Ionicons
                  name="ellipse"
                  size={6}
                  color={COLORS.teal}
                  style={{ marginTop: 6 }}
                />
                <Text
                  style={{
                    color: COLORS.ink,
                    fontSize: 13,
                    flex: 1,
                    lineHeight: 20,
                  }}
                >
                  {ing.name}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Add to list CTA */}
        <TouchableOpacity
          onPress={() => onAddToList(recipe)}
          style={{
            marginTop: 12,
            backgroundColor: COLORS.teal,
            borderRadius: 12,
            paddingVertical: 13,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
          activeOpacity={0.8}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
            Add ingredients to list
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Recipe detail modal ──────────────────────────────────────────────────────

function StatPill({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: COLORS.surface,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Ionicons name={icon as any} size={14} color={COLORS.teal} />
      <Text style={{ fontSize: 12, fontWeight: "600", color: COLORS.ink }}>
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: COLORS.muted }}>{label}</Text>
    </View>
  );
}

function RecipeDetailModal({
  recipe,
  visible,
  onClose,
  onAddToList,
}: {
  recipe: Recipe | null;
  visible: boolean;
  onClose: () => void;
  onAddToList: (recipe: Recipe) => void;
}) {
  const qcModal = useQueryClient();
  const [modalIsHearted, setModalIsHearted] = useState(false);

  React.useEffect(() => {
    if (recipe) setModalIsHearted(recipe.is_hearted ?? false);
  }, [recipe?.id]);

  const modalHeartMutation = useMutation({
    mutationFn: (hearted: boolean) =>
      hearted ? unheartRecipe(recipe!.id) : heartRecipe(recipe!.id),
    onMutate: (hearted: boolean) => setModalIsHearted(!hearted),
    onError: (_err: unknown, hearted: boolean) => setModalIsHearted(hearted),
    onSuccess: () => {
      qcModal.invalidateQueries({ queryKey: ["arRecipeHearts"] });
      qcModal.invalidateQueries({ queryKey: ["arRecipeDetail", recipe?.id] });
    },
  });

  const toggleModalHeart = () =>
    recipe && modalHeartMutation.mutate(modalIsHearted);

  const { data: detail, isLoading } = useQuery<RecipeDetail>({
    queryKey: ["arRecipeDetail", recipe?.id],
    queryFn: () => fetchARRecipeDetail(recipe!.id).then((r) => r.data),
    enabled: visible && !!recipe,
    staleTime: 10 * 60 * 1000,
  });

  const translateY = React.useRef(new Animated.Value(SCREEN_H)).current;

  // Slide in when modal opens, reset when it closes
  React.useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
        speed: 14,
      }).start();
    } else {
      translateY.setValue(SCREEN_H);
    }
  }, [visible]);

  const dismiss = React.useCallback(() => {
    Animated.timing(translateY, {
      toValue: SCREEN_H,
      duration: 260,
      useNativeDriver: true,
    }).start(() => onClose());
  }, [onClose]);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 6 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          Animated.timing(translateY, {
            toValue: SCREEN_H,
            duration: 220,
            useNativeDriver: true,
          }).start(() => onClose());
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
        }
      },
    }),
  ).current;

  // Merge: use detail data where available, fall back to card data
  const r = detail ?? recipe;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismiss}
    >
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={dismiss}
        />
        <Animated.View
          style={{
            backgroundColor: "#fff",
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: "90%",
            overflow: "hidden",
            transform: [{ translateY }],
          }}
        >
          {/* Hero image */}
          {r?.image_url ? (
            <View style={{ height: 280 }}>
              <Image
                source={{ uri: r.image_url }}
                style={{ width: "100%", height: 280 }}
                resizeMode="cover"
              />
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.75)"]}
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 130,
                  justifyContent: "flex-end",
                  padding: 18,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontWeight: "900",
                    fontSize: 22,
                    lineHeight: 28,
                  }}
                >
                  {r.name}
                </Text>
              </LinearGradient>
              {/* Transparent drag zone — covers image, captures swipe-down */}
              <View
                {...panResponder.panHandlers}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 280,
                  zIndex: 1,
                }}
                pointerEvents="box-only"
              />
              {/* Close button sits above drag zone */}
              <TouchableOpacity
                onPress={dismiss}
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  backgroundColor: "rgba(0,0,0,0.45)",
                  borderRadius: 20,
                  padding: 8,
                  zIndex: 2,
                }}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
              {/* Heart button — top left */}
              <View
                style={{
                  position: "absolute",
                  top: 12,
                  left: 12,
                  zIndex: 2,
                }}
              >
                <HeartButton
                  isHearted={modalIsHearted}
                  size={20}
                  onPress={toggleModalHeart}
                />
              </View>
            </View>
          ) : (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 20,
                paddingBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "800",
                  color: COLORS.ink,
                  flex: 1,
                  paddingRight: 12,
                }}
              >
                {r?.name}
              </Text>
              <TouchableOpacity onPress={dismiss}>
                <Ionicons name="close" size={24} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
          )}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
          >
            {/* Quick stats */}
            {detail && (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <StatPill
                  icon="people-outline"
                  label="servings"
                  value={
                    detail.servings != null ? String(detail.servings) : null
                  }
                />
                <StatPill
                  icon="time-outline"
                  label="prep"
                  value={detail.prep_mins ? `${detail.prep_mins} min` : null}
                />
                <StatPill
                  icon="flame-outline"
                  label="cook"
                  value={detail.cook_mins ? `${detail.cook_mins} min` : null}
                />
              </View>
            )}

            {/* Description */}
            {!!r?.description && (
              <Text
                style={{
                  color: COLORS.muted,
                  fontSize: 14,
                  lineHeight: 21,
                  marginBottom: 18,
                }}
              >
                {r.description}
              </Text>
            )}

            {/* Nutrition */}
            {r?.nutrition && (
              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: COLORS.surface,
                  borderRadius: 14,
                  paddingVertical: 14,
                  marginBottom: 20,
                }}
              >
                <NutriBadge
                  label="Calories"
                  value={r.nutrition.calories}
                  color={COLORS.ink}
                />
                <View style={{ width: 1, backgroundColor: COLORS.border }} />
                <NutriBadge
                  label="Protein"
                  value={
                    r.nutrition.protein ? `${r.nutrition.protein}g` : undefined
                  }
                  color="#10B981"
                />
                <View style={{ width: 1, backgroundColor: COLORS.border }} />
                <NutriBadge
                  label="Carbs"
                  value={
                    r.nutrition.carbohydrate
                      ? `${r.nutrition.carbohydrate}g`
                      : undefined
                  }
                  color="#F59E0B"
                />
                <View style={{ width: 1, backgroundColor: COLORS.border }} />
                <NutriBadge
                  label="Fat"
                  value={r.nutrition.fat ? `${r.nutrition.fat}g` : undefined}
                  color="#EF4444"
                />
              </View>
            )}

            {/* Ingredients */}
            <Text
              style={{
                fontSize: 17,
                fontWeight: "800",
                color: COLORS.ink,
                marginBottom: 10,
              }}
            >
              Ingredients
            </Text>
            {(r?.ingredients ?? []).map((ing, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  paddingVertical: 6,
                  borderBottomWidth:
                    i < (r?.ingredients.length ?? 1) - 1 ? 1 : 0,
                  borderBottomColor: COLORS.border,
                  gap: 10,
                }}
              >
                <Ionicons
                  name="ellipse"
                  size={6}
                  color={COLORS.teal}
                  style={{ marginTop: 7 }}
                />
                <Text
                  style={{
                    color: COLORS.ink,
                    fontSize: 14,
                    flex: 1,
                    lineHeight: 21,
                  }}
                >
                  {ing.name}
                </Text>
              </View>
            ))}

            {/* Directions */}
            {isLoading && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 24,
                }}
              >
                <ActivityIndicator size="small" color={COLORS.teal} />
                <Text style={{ color: COLORS.muted, fontSize: 13 }}>
                  Loading directions…
                </Text>
              </View>
            )}
            {(detail?.directions ?? []).length > 0 && (
              <View style={{ marginTop: 24 }}>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: "800",
                    color: COLORS.ink,
                    marginBottom: 12,
                  }}
                >
                  Directions
                </Text>
                {detail!.directions.map((step, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 12,
                      marginBottom: 14,
                    }}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: COLORS.teal,
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        {i + 1}
                      </Text>
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        color: COLORS.ink,
                        fontSize: 14,
                        lineHeight: 22,
                      }}
                    >
                      {step}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Sticky add-to-list button */}
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "#fff",
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 28,
              borderTopWidth: 1,
              borderTopColor: COLORS.border,
            }}
          >
            <TouchableOpacity
              onPress={() => {
                dismiss();
                setTimeout(() => r && onAddToList(r), 300);
              }}
              style={{
                backgroundColor: COLORS.teal,
                borderRadius: 14,
                paddingVertical: 15,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="cart-outline" size={20} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                Add {r?.ingredients.length ?? 0} ingredients to list
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Add-to-list bottom sheet ──────────────────────────────────────────────────

function AddToListSheet({
  recipe,
  visible,
  onClose,
}: {
  recipe: Recipe | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { currentList } = useListStore();
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [selectedListId, setSelectedListId] = useState<string | undefined>(
    undefined,
  );

  const { data: listsData } = useQuery<ShoppingList[]>({
    queryKey: ["shoppingLists"],
    queryFn: () => fetchShoppingLists().then((r) => r.data),
    enabled: visible,
  });
  const lists = listsData ?? [];

  React.useEffect(() => {
    if (visible) {
      setDone(false);
      setAdding(false);
      setAddedCount(0);
      setSkippedCount(0);
      setSelectedListId(currentList?.id ?? undefined);
    }
  }, [visible, currentList]);

  const handleAdd = useCallback(async () => {
    if (!recipe) return;
    setAdding(true);
    try {
      // Fetch existing items so we can skip duplicates
      const existingRes = await fetchListItems(selectedListId);
      const existingItems: { name: string }[] = Array.isArray(existingRes.data)
        ? existingRes.data
        : (existingRes.data?.items ?? []);
      const existingNames = new Set(
        existingItems.map((item) => item.name.toLowerCase().trim()),
      );

      let added = 0;
      let skipped = 0;
      for (const ing of recipe.ingredients) {
        if (existingNames.has(ing.name.toLowerCase().trim())) {
          skipped++;
        } else {
          await addListItem(ing.name, 1, selectedListId);
          added++;
        }
      }
      setAddedCount(added);
      setSkippedCount(skipped);
      setDone(true);
      setTimeout(onClose, 1800);
    } catch {
      Alert.alert("Error", "Could not add items. Please try again.");
      setAdding(false);
    }
  }, [recipe, selectedListId, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1 }}>
        <TouchableOpacity
          activeOpacity={1}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={onClose}
        />
        <View
          style={{
            backgroundColor: "#fff",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: 44,
          }}
        >
          <View
            style={{
              width: 40,
              height: 4,
              backgroundColor: COLORS.border,
              borderRadius: 2,
              alignSelf: "center",
              marginBottom: 18,
            }}
          />
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: COLORS.ink,
              marginBottom: 4,
            }}
          >
            Add to shopping list
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.muted, marginBottom: 20 }}>
            {recipe?.ingredients.length ?? 0} ingredients from "
            {recipe?.name ?? ""}"
          </Text>

          {lists.length > 1 && (
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontWeight: "600",
                  color: COLORS.ink,
                  marginBottom: 10,
                  fontSize: 13,
                }}
              >
                Choose a list:
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
              >
                {lists.map((list) => {
                  const active = list.id === selectedListId;
                  return (
                    <TouchableOpacity
                      key={list.id}
                      onPress={() => setSelectedListId(list.id)}
                      style={{
                        backgroundColor: active ? COLORS.teal : COLORS.surface,
                        borderRadius: 10,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderWidth: active ? 0 : 1,
                        borderColor: COLORS.border,
                      }}
                    >
                      <Text
                        style={{
                          color: active ? "#fff" : COLORS.ink,
                          fontWeight: "600",
                          fontSize: 13,
                        }}
                      >
                        {list.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 12,
              padding: 14,
              marginBottom: 20,
              maxHeight: 160,
            }}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {recipe?.ingredients.map((ing, i) => (
                <Text
                  key={i}
                  style={{
                    color: COLORS.ink,
                    fontSize: 13,
                    paddingVertical: 2,
                  }}
                >
                  · {ing.name}
                </Text>
              ))}
            </ScrollView>
          </View>

          <TouchableOpacity
            onPress={handleAdd}
            disabled={adding || done}
            style={{
              backgroundColor: done ? COLORS.success : COLORS.teal,
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              opacity: adding && !done ? 0.7 : 1,
            }}
            activeOpacity={0.8}
          >
            {adding && !done ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons
                name={done ? "checkmark-circle-outline" : "cart-outline"}
                size={20}
                color="#fff"
              />
            )}
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
              {done
                ? skippedCount > 0 && addedCount === 0
                  ? "All already in list"
                  : skippedCount > 0
                    ? `Added ${addedCount} • ${skippedCount} already in list`
                    : `Added ${addedCount} items`
                : adding
                  ? "Adding…"
                  : `Add ${recipe?.ingredients.length ?? 0} items`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Recipe list ───────────────────────────────────────────────────────────────

function RecipeList({
  category,
  page,
  onRefresh,
  onAddToList,
  onViewDetail,
}: {
  category: Category;
  page: number;
  onRefresh: () => void;
  onAddToList: (recipe: Recipe) => void;
  onViewDetail: (recipe: Recipe) => void;
}) {
  const isFavs = category === "favorites";
  const { data, isLoading, isFetching, isError, refetch } = useQuery<Recipe[]>({
    queryKey: isFavs
      ? ["arRecipeHearts"]
      : ["arRecipeInspiration", category, page],
    queryFn: isFavs
      ? () => fetchHeartedRecipes().then((r) => r.data.recipes)
      : () => fetchARRecipeSearch(category, 12).then((r) => r.data.recipes),
    staleTime: isFavs ? 0 : 5 * 60 * 1000,
    placeholderData: isFavs
      ? undefined
      : (previousData, previousQuery) =>
          (previousQuery?.queryKey as unknown[])?.[1] === category
            ? previousData
            : undefined,
  });

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingTop: 80,
        }}
      >
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ color: COLORS.muted, marginTop: 12, fontSize: 14 }}>
          Finding recipes…
        </Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingTop: 60,
          paddingHorizontal: 32,
        }}
      >
        <Image
          source={require("../../assets/cartara_empty_fancy.png")}
          style={{
            width: 300,
            height: 300,
            marginBottom: -30,
            marginTop: -75,
            opacity: 0.75,
          }}
          resizeMode="contain"
        />
        <Text
          style={{
            color: COLORS.ink,
            fontWeight: "700",
            fontSize: 16,
            marginTop: 16,
            textAlign: "center",
          }}
        >
          Couldn't load recipes
        </Text>
        <Text
          style={{
            color: COLORS.muted,
            fontSize: 13,
            textAlign: "center",
            marginTop: 6,
            lineHeight: 19,
          }}
        >
          Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={{
            marginTop: 20,
            backgroundColor: COLORS.teal,
            borderRadius: 10,
            paddingHorizontal: 24,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingTop: 60,
          paddingHorizontal: 32,
        }}
      >
        <Image
          source={require("../../assets/cartara_empty_fancy.png")}
          style={{
            width: 300,
            height: 300,
            marginBottom: -30,
            marginTop: -75,
            opacity: 0.75,
          }}
          resizeMode="contain"
        />
        <Text
          style={{
            color: COLORS.mutedSemiTransparent,
            fontWeight: "700",
            fontSize: 16,
            marginTop: 16,
            textAlign: "center",
          }}
        >
          {isFavs ? "No favorites yet" : "No recipes found"}
        </Text>
        <Text
          style={{
            color: COLORS.muted,
            fontSize: 13,
            textAlign: "center",
            marginTop: 6,
            lineHeight: 19,
          }}
        >
          {isFavs
            ? "Add favorites to save them here"
            : "Check your connection and try again."}
        </Text>
        {!isFavs && (
          <TouchableOpacity
            onPress={() => refetch()}
            style={{
              marginTop: 20,
              backgroundColor: COLORS.teal,
              borderRadius: 10,
              paddingHorizontal: 24,
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => (
        <RecipeCard
          recipe={item}
          onAddToList={onAddToList}
          onViewDetail={onViewDetail}
        />
      )}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 40,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isFetching}
          onRefresh={onRefresh}
          tintColor={COLORS.teal}
          colors={[COLORS.teal]}
        />
      }
    />
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function InspirationScreen() {
  const [activeCategory, setActiveCategory] =
    useState<Category>(getInitialCategory);
  const [pages, setPages] = useState<Partial<Record<Category, number>>>(() => {
    const rand = () => Math.floor(Math.random() * 10);
    return {
      breakfast: rand(),
      lunch: rand(),
      dinner: rand(),
      dessert: rand(),
    };
  });
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const activeCfg = CATEGORIES.find((c) => c.key === activeCategory)!;

  const handleRefresh = useCallback(() => {
    setPages((p) => ({
      ...p,
      [activeCategory]: ((p[activeCategory] ?? 0) + 1) % 10,
    }));
  }, [activeCategory]);

  const handleAddToList = useCallback((recipe: Recipe) => {
    setModalRecipe(recipe);
    setShowModal(true);
  }, []);

  const handleViewDetail = useCallback((recipe: Recipe) => {
    setDetailRecipe(recipe);
    setShowDetail(true);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <LinearGradient
        colors={activeCfg.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <SafeAreaView edges={["top"]}>
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 20,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                marginBottom: 2,
              }}
            >
              <Ionicons name={activeCfg.icon as any} size={26} color="#fff" />
              <Text style={{ fontSize: 26, fontWeight: "800", color: "#fff" }}>
                {activeCfg.headline}
              </Text>
            </View>
            <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 14 }}>
              {activeCfg.sub}
            </Text>
          </View>

          {/* Category pill tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 16,
              gap: 8,
            }}
          >
            {CATEGORIES.map((cat) => {
              const active = cat.key === activeCategory;
              return (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => setActiveCategory(cat.key)}
                  style={{
                    backgroundColor: active
                      ? "rgba(255,255,255,0.95)"
                      : "rgba(255,255,255,0.2)",
                    borderRadius: 20,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={15}
                    color={active ? (activeCfg.gradient[0] as string) : "#fff"}
                  />
                  <Text
                    style={{
                      fontWeight: "700",
                      fontSize: 13,
                      color: active
                        ? (activeCfg.gradient[0] as string)
                        : "#fff",
                    }}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>

      <View style={{ flex: 1 }}>
        <RecipeList
          category={activeCategory}
          page={pages[activeCategory] ?? 0}
          onRefresh={handleRefresh}
          onAddToList={handleAddToList}
          onViewDetail={handleViewDetail}
        />
      </View>

      <AddToListSheet
        recipe={modalRecipe}
        visible={showModal}
        onClose={() => {
          setShowModal(false);
          setModalRecipe(null);
        }}
      />

      <RecipeDetailModal
        recipe={detailRecipe}
        visible={showDetail}
        onClose={() => {
          setShowDetail(false);
          setDetailRecipe(null);
        }}
        onAddToList={handleAddToList}
      />
    </View>
  );
}
