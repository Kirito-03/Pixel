import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export default function LoadingScreen() {
  const { theme, colors } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 20,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.logoContainer}>
          <Text style={styles.pixelText}>PIXEL</Text>
          <Text style={[styles.sekaiText, { color: colors.text }]}> NO SEKAI</Text>
        </View>
        <ActivityIndicator size="large" color="#E50914" style={styles.spinner} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
  },
  pixelText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#E50914',
    letterSpacing: 2,
  },
  sekaiText: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 2,
  },
  spinner: {
    transform: [{ scale: 1.2 }],
  }
});
