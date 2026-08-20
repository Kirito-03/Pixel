import React, { useRef, useState } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  useWindowDimensions,
  PanResponder,
  Platform,
  GestureResponderHandlers,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Movie, TVShow, ContentItem } from '../types';
import MovieCard from './MovieCard';
import { colors, spacing, typography } from '../theme';

interface Props {
  title: string;
  movies: (Movie | TVShow | ContentItem)[];
  onMoviePress: (id: number) => void;
  accentColor?: string;
}

export default function MovieRow({ title, movies, onMoviePress, accentColor = colors.primary }: Props) {
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
  const [scrollX, setScrollX] = useState(0);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  
  const scrollXRef = useRef(0);
  const isDragging = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => Platform.OS === 'web',
      onMoveShouldSetPanResponder: () => Platform.OS === 'web',

      onPanResponderGrant: () => {
        scrollXRef.current = scrollX;
        isDragging.current = true;
      },

      onPanResponderMove: (_, gestureState) => {
        const newOffset = scrollXRef.current - (gestureState.dx * 0.3);
        flatListRef.current?.scrollToOffset({ offset: newOffset, animated: false });
      },

      onPanResponderRelease: () => {
        isDragging.current = false;
      },
    })
  ).current;

  const handleLeftArrow = () => {
    const newPosition = Math.max(0, scrollX - SCROLL_AMOUNT);
    flatListRef.current?.scrollToOffset({ offset: newPosition, animated: true });
  };

  const handleRightArrow = () => {
    const newPosition = scrollX + SCROLL_AMOUNT;
    flatListRef.current?.scrollToOffset({ offset: newPosition, animated: true });
  };

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const contentWidth = event.nativeEvent.contentSize.width;
    const layoutWidth = event.nativeEvent.layoutMeasurement.width;
    const maxScroll = contentWidth - layoutWidth;
    
    setScrollX(offsetX);
    scrollXRef.current = offsetX;
    setShowLeftArrow(offsetX > 5);
    setShowRightArrow(offsetX < maxScroll - 5);
  };

  return (
    <View style={styles.container}>
      {/* Título de la sección con barra de acento */}
      <View style={styles.titleRow}>
        <View style={[styles.titleAccent, { backgroundColor: accentColor }]} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      
      <View 
        style={[
          styles.listContainer,
          isWeb && ({ cursor: 'grab' } as any)
        ]} 
        {...(panResponder.panHandlers as GestureResponderHandlers)}
      >
        {/* Flecha izquierda — glassmorphism */}
        {showLeftArrow && !isSmallScreen && (
          <TouchableOpacity 
            style={[styles.arrow, styles.leftArrow]}
            onPress={handleLeftArrow}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
        )}

        <FlatList
          ref={flatListRef}
          data={movies}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <MovieCard movie={item} onPress={() => onMoviePress(item.id)} />
          )}
          contentContainerStyle={styles.listContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          scrollEnabled={Platform.OS !== 'web'} 
        />

        {/* Flecha derecha — glassmorphism */}
        {showRightArrow && !isSmallScreen && (
          <TouchableOpacity 
            style={[styles.arrow, styles.rightArrow]}
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
    color: colors.text,
  },
  listContainer: {
    position: 'relative',
    overflow: 'visible' as any,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 80,
  },
  arrow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 48,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  leftArrow: {
    left: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.06)',
  },
  rightArrow: {
    right: 0,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.06)',
  },
});