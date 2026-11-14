import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NSFWAnime } from '../services/nsfwApi';
import MyListButton from './MyListButton';
import { useTheme } from '../contexts/ThemeContext';

interface HentaiCardProps {
  item: NSFWAnime;
  onPress: () => void;
  cardWidth?: number;
}

export const HentaiCard = ({ item, onPress, cardWidth }: HentaiCardProps) => {
  const { colors } = useTheme();
  const [imageError, setImageError] = useState(false);
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    setImageError(false);
  }, [item.poster_path]);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      style={[
        styles.cardOuter,
        cardWidth ? { width: cardWidth } : null,
        isWeb ? ({ cursor: 'pointer' } as any) : null,
      ]}
    >
      <View style={styles.card}>
        <View
          style={[
            styles.posterBox,
            {
              backgroundColor: colors.card,
              borderColor: colors.glassBorder,
            },
          ]}
        >
          {!item.poster_path || imageError ? (
            <View style={[styles.fallbackBox, { backgroundColor: colors.cardLight }]}>
              <Ionicons name="film-outline" size={28} color={colors.textMuted} />
              <Text style={[styles.fallbackText, { color: colors.textMuted }]}>18+</Text>
            </View>
          ) : (
            <Image
              source={{ uri: item.poster_path }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          )}
          <View style={{ position: 'absolute', top: 6, right: 6 }}><MyListButton id={item.slug} type="h_anime" compact /></View>
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={styles.badgeText}>18+</Text>
          </View>
        </View>
        <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardOuter: {
    width: '100%',
  },
  card: {
    width: '100%',
  },
  posterBox: {
    width: '100%',
    aspectRatio: 0.7,
    borderRadius: 0,
    borderWidth: 0,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
  },
  fallbackBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  fallbackText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'left',
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 0,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
