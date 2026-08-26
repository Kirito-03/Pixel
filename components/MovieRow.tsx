import React, { useRef, useState } from 'react';
import { 
  View, 
  Text, 
  ScrollView,
  FlatList,
  TouchableOpacity, 
  useWindowDimensions,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Movie, TVShow, ContentItem } from '../types';
import MovieCard from './MovieCard';
import { spacing, typography } from '../theme';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  title: string;
  movies: (Movie | TVShow | ContentItem)[];
  onMoviePress: (id: number) => void;
  accentColor?: string;
}

export default function MovieRow({ title, movies, onMoviePress, accentColor }: Props) {
  const { colors, theme } = useTheme();
  const effectiveAccentColor = accentColor || colors.primary;
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;
  const isWeb = Platform.OS === 'web';
  // Cards más grandes y premium
  const CARD_WIDTH = isSmallScreen ? width * 0.34 : 155;
  const CARD_MARGIN = isSmallScreen ? 10 : 12;
  const TOTAL_CARD_WIDTH = CARD_WIDTH + CARD_MARGIN;
  const CARDS_PER_SCREEN = Math.floor(width / TOTAL_CARD_WIDTH);
  const SCROLL_AMOUNT = TOTAL_CARD_WIDTH * CARDS_PER_SCREEN;
  
  const flatListRef = useRef<FlatList<Movie | TVShow | ContentItem>>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const [scrollX, setScrollX] = useState(0);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  


  const handleLeftArrow = () => {
    const newPosition = Math.max(0, scrollX - SCROLL_AMOUNT);
    if (isWeb) {
      const node = (scrollViewRef.current as any)?.getScrollableNode?.();
      if (node && node.scrollTo) {
        node.scrollTo({ left: newPosition, behavior: 'smooth' });
      } else {
        scrollViewRef.current?.scrollTo({ x: newPosition, animated: true });
      }
    } else {
      flatListRef.current?.scrollToOffset({ offset: newPosition, animated: true });
    }
  };

  const handleRightArrow = () => {
    const newPosition = scrollX + SCROLL_AMOUNT;
    if (isWeb) {
      const node = (scrollViewRef.current as any)?.getScrollableNode?.();
      if (node && node.scrollTo) {
        node.scrollTo({ left: newPosition, behavior: 'smooth' });
      } else {
        scrollViewRef.current?.scrollTo({ x: newPosition, animated: true });
      }
    } else {
      flatListRef.current?.scrollToOffset({ offset: newPosition, animated: true });
    }
  };

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const contentWidth = event.nativeEvent.contentSize.width;
    const layoutWidth = event.nativeEvent.layoutMeasurement.width;
    const maxScroll = contentWidth - layoutWidth;
    
    setScrollX(offsetX);
    setShowLeftArrow(offsetX > 5);
    setShowRightArrow(offsetX < maxScroll - 5);
  };

  return (
    <View style={styles.container}>
      {/* Título de la sección con barra de acento */}
      <View style={styles.titleRow}>
        <View style={[styles.titleAccent, { backgroundColor: effectiveAccentColor }]} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      
      <View style={styles.listContainer}>
        {/* Flecha izquierda — glassmorphism */}
        {showLeftArrow && !isSmallScreen && (
          <TouchableOpacity 
            style={[styles.arrow, styles.leftArrow, { 
              backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.65)' : 'rgba(255, 255, 255, 0.85)',
              borderRightColor: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' 
            }]}
            onPress={handleLeftArrow}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
        )}

        {isWeb ? (
          <ScrollView
            ref={scrollViewRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            style={{ overflow: 'visible' as any }}
          >
            {movies.map((item, index) => (
              <MovieCard 
                key={item.id} 
                movie={item} 
                onPress={() => onMoviePress(item.id)} 
                isFirst={index === 0}
                isLast={index === movies.length - 1}
              />
            ))}
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            data={movies}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item, index }) => (
              <MovieCard 
                movie={item} 
                onPress={() => onMoviePress(item.id)} 
                isFirst={index === 0}
                isLast={index === movies.length - 1}
              />
            )}
            contentContainerStyle={styles.listContent}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          />
        )}

        {/* Flecha derecha — glassmorphism */}
        {showRightArrow && !isSmallScreen && (
          <TouchableOpacity 
            style={[styles.arrow, styles.rightArrow, { 
              backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.65)' : 'rgba(255, 255, 255, 0.85)',
              borderLeftColor: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' 
            }]}
            onPress={handleRightArrow}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-forward" size={28} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 32,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 20,
    gap: 10,
  },
  titleAccent: {
    width: 3,
    height: 20,
    borderRadius: 2,
  },
  sectionTitle: {
    ...typography.sectionTitle,
  },
  listContainer: {
    position: 'relative',
    overflow: 'visible' as any,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  arrow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  leftArrow: {
    left: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    borderRightWidth: 1,
  },
  rightArrow: {
    right: 0,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    borderLeftWidth: 1,
  },
});