import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchProduct, addListItem } from '../../../lib/api';
import { COLORS } from '../../../lib/constants';
import { Ionicons } from "@expo/vector-icons";

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

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: async () => (await fetchProduct(id)).data,
  });

  const addMutation = useMutation({
    mutationFn: () => addListItem(product!.name, 1),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['list'] });
      Alert.alert('Added!', `${product?.name} added to your list.`);
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, flexDirection: 'row', alignItems: 'center' }}
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.muted} />
          <Text
            style={{
              fontFamily: 'Montserrat_500Medium',
              color: COLORS.muted,
              fontSize: 14,
            }}
          >
            Back
          </Text>
        </TouchableOpacity>

        {isLoading ? (
          <ActivityIndicator color={COLORS.teal} style={{ marginTop: 60 }} />
        ) : !product ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Text
              style={{
                fontFamily: 'Montserrat_600SemiBold',
                fontSize: 16,
                color: COLORS.ink,
              }}
            >
              Product not found
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {/* Hero */}
            <View
              style={{
                backgroundColor: COLORS.teal + '10',
                marginHorizontal: 24,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                height: 220,
                marginBottom: 28,
              }}
            >
              <Text style={{ fontSize: 88 }}>{product.emoji}</Text>
            </View>

            <View style={{ paddingHorizontal: 24 }}>
              {/* AI tag */}
              <View
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: COLORS.cyan + '18',
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 20,
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Montserrat_600SemiBold',
                    fontSize: 12,
                    color: COLORS.teal,
                    letterSpacing: 0.5,
                  }}
                >
                  {product.ai_tag}
                </Text>
              </View>

              {/* Name */}
              <Text
                style={{
                  fontFamily: 'Montserrat_700Bold',
                  fontSize: 26,
                  color: COLORS.ink,
                  lineHeight: 34,
                  marginBottom: 6,
                }}
              >
                {product.name}
              </Text>

              {/* Brand */}
              <Text
                style={{
                  fontFamily: 'Montserrat_400Regular',
                  fontSize: 15,
                  color: COLORS.muted,
                  marginBottom: 28,
                }}
              >
                by {product.brand}
              </Text>

              {/* Info cards */}
              <View
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  marginBottom: 32,
                }}
              >
                <InfoCard label="Price" value={`$${product.price.toFixed(2)}`} />
                <InfoCard label="Unit" value={product.unit} />
                <InfoCard label="Category" value={product.category} />
              </View>

              {/* Add to list CTA */}
              <TouchableOpacity
                onPress={() => addMutation.mutate()}
                disabled={addMutation.isPending}
                activeOpacity={0.85}
                style={{
                  backgroundColor: COLORS.teal,
                  borderRadius: 16,
                  paddingVertical: 18,
                  alignItems: 'center',
                  shadowColor: COLORS.teal,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 12,
                  elevation: 4,
                }}
              >
                {addMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    style={{
                      fontFamily: 'Montserrat_700Bold',
                      fontSize: 16,
                      color: '#fff',
                      letterSpacing: 0.3,
                    }}
                  >
                    + Add to Shopping List
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.card,
        borderRadius: 14,
        padding: 14,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: 'Montserrat_400Regular',
          fontSize: 11,
          color: COLORS.muted,
          marginBottom: 4,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: 'Montserrat_700Bold',
          fontSize: 14,
          color: COLORS.ink,
          textAlign: 'center',
        }}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}
