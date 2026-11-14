import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NSFWAnime } from '../services/nsfwApi';
import { useTheme } from '../contexts/ThemeContext';
import { HentaiCard } from './HentaiComponents';

interface HentaiShelfProps {
  title: string;
  items: NSFWAnime[];
  onItemPress: (item: NSFWAnime) => void;
  accentColor?: string;
}

/**
 * Horizontal shelf for 18+ catalog groups, matching Inicio's row distribution
 * with flat edges (no borders or rounded corners) and non-conflicting web scroll arrows.
 */
export default function HentaiShelf({
  title,
  items,
  onItemPress,
  accentColor,
}: HentaiShelfProps) {
  const { colors, theme } = useTheme();
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;
  const isWeb = Platform.OS === 'web';
  const effectiveAccent = accentColor || colors.primary;

  // On mobile/narrow web, 0.34 of bounded width yields 2 full posters + 3rd partially visible
  const boundedWidth = Math.min(width, 1120);
  const cardWidth = isSmallScreen ? Math.max(108, Math.round(boundedWidth * 0.34)) : 160;
  const cardGap = isSmallScreen ? 10 : 12;
  const stepWidth = cardWidth + cardGap;

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const [scrollX, setScrollX] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  useEffect(() => {
    setShowLeftArrow(scrollX > 5);
    setShowRightArrow(
      contentWidth > viewportWidth + 5 && scrollX < contentWidth - viewportWidth - 5
    );
  }, [contentWidth, viewportWidth, scrollX]);

  if (!items || items.length === 0) return null;

  const visibleStep = Math.max(
    stepWidth,
    stepWidth * Math.max(1, Math.floor((viewportWidth || boundedWidth) / stepWidth))
  );

  const handleLeftArrow = (e?: any) => {
    e?.stopPropagation?.();
    const newPosition = Math.max(0, scrollXRef.current - visibleStep);
    scrollXRef.current = newPosition;
    setScrollX(newPosition);
    scrollViewRef.current?.scrollTo({ x: newPosition, animated: true });
  };

  const handleRightArrow = (e?: any) => {
    e?.stopPropagation?.();
    const maxScroll = Math.max(0, contentWidth - viewportWidth);
    const newPosition = Math.min(maxScroll, scrollXRef.current + visibleStep);
    scrollXRef.current = newPosition;
    setScrollX(newPosition);
    scrollViewRef.current?.scrollTo({ x: newPosition, animated: true });
  };

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const totalW = event.nativeEvent.contentSize.width;
    const layoutW = event.nativeEvent.layoutMeasurement.width;
    scrollXRef.current = offsetX;
    setScrollX(offsetX);
    setContentWidth(totalW);
    setViewportWidth(layoutW);
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <View style={[styles.titleAccent, { backgroundColor: effectiveAccent }]} />
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.text, fontSize: isSmallScreen ? 18 : 22 },
          ]}
        >
          {title}
        </Text>
      </View>

      <View style={styles.listContainer}>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}
          onContentSizeChange={(w) => setContentWidth(w)}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[styles.listContent, { gap: cardGap }]}
          style={isWeb ? ({ overflowX: 'auto', overflowY: 'hidden' } as any) : undefined}
        >
          {items.map((item) => (
            <HentaiCard
              key={`${item.id}-${item.slug}`}
              item={item}
              cardWidth={cardWidth}
              onPress={() => onItemPress(item)}
            />
          ))}
        </ScrollView>

        {showLeftArrow && !isSmallScreen && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Anterior en ${title}`}
            onPress={handleLeftArrow}
            activeOpacity={0.85}
            style={[
              styles.arrow,
              styles.leftArrow,
              {
                backgroundColor:
                  theme === 'dark' ? 'rgba(0, 0, 0, 0.72)' : 'rgba(255, 255, 255, 0.88)',
              },
              isWeb ? ({ cursor: 'pointer' } as any) : null,
            ]}
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
        )}

        {showRightArrow && !isSmallScreen && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Siguiente en ${title}`}
            onPress={handleRightArrow}
            activeOpacity={0.85}
            style={[
              styles.arrow,
              styles.rightArrow,
              {
                backgroundColor:
                  theme === 'dark' ? 'rgba(0, 0, 0, 0.72)' : 'rgba(255, 255, 255, 0.88)',
              },
              isWeb ? ({ cursor: 'pointer' } as any) : null,
            ]}
          >
            <Ionicons name="chevron-forward" size={26} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 28,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  titleAccent: {
    width: 3,
    height: 20,
    borderRadius: 0,
  },
  sectionTitle: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  listContainer: {
    position: 'relative',
  },
  listContent: {
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  arrow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    borderRadius: 0,
    borderWidth: 0,
  },
  leftArrow: {
    left: 0,
  },
  rightArrow: {
    right: 0,
  },
});
