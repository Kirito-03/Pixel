import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Number of 3D depth particles
const NUM_PARTICLES = 60;

// Generate static properties for depth illusion
const particlesConfig = Array.from({ length: NUM_PARTICLES }).map((_, index) => {
  const isOutlined = Math.random() > 0.5;
  const initialX = Math.random() * 100; // 0 to 100%
  const initialY = Math.random() * 1500; // Initial spawn Y
  const zDepth = Math.random(); // 0 (far) to 1 (near)
  
  const size = 12; // Base size
  
  // Depth mechanics: further away = smaller, more transparent, and slower
  const floatDuration = 15000 + (1 - zDepth) * 30000;
  const depthOpacity = 0.15 + zDepth * 0.7;
  const depthScale = 0.2 + zDepth * 1.2;

  return {
    id: index,
    isOutlined,
    initialX,
    initialY,
    size,
    floatDuration,
    depthOpacity,
    depthScale,
  };
});

const DepthParticle = ({ config }: { config: typeof particlesConfig[0] }) => {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let isActive = true;

    const startAnimation = () => {
      translateY.setValue(0);
      Animated.timing(translateY, {
        toValue: -2000,
        duration: config.floatDuration,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && isActive) {
          startAnimation();
        }
      });
    };

    startAnimation();

    return () => {
      isActive = false;
      translateY.stopAnimation();
    };
  }, [config.floatDuration]);

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: `${config.initialX}%`,
          top: config.initialY,
          width: config.size,
          height: config.size,
          opacity: config.depthOpacity,
          borderRadius: 2, 
        },
        config.isOutlined
          ? {
              backgroundColor: 'transparent',
              borderWidth: 1.5,
              borderColor: '#E50914',
            }
          : {
              backgroundColor: '#E50914',
            },
        {
          transform: [
            { translateY },
            { scale: config.depthScale }
          ]
        }
      ]}
    />
  );
};

export default function AnimatedLeftPanel({ fullScreenMode = false }: { fullScreenMode?: boolean }) {
  return (
    <View style={[styles.leftPanel, fullScreenMode && { width: '100%' }]}>
      {/* 3D Depth Matrix Particles */}
      {particlesConfig.map((config) => (
        <DepthParticle key={config.id} config={config} />
      ))}

      {!fullScreenMode && (
        <>
          {/* Logo top-left */}
          <View style={styles.topLogo}>
            <View style={styles.logoIconBox}>
              <Ionicons name="play" size={11} color="#fff" />
            </View>
            <Text style={styles.logoText}>PIXEL NO SEKAI</Text>
          </View>

      {/* Branding bottom-left */}
      <View style={styles.brandingBlock}>
        <View style={styles.subtitleRow}>
          <View style={styles.accentBar} />
          <Text style={styles.subtitleText}>T U   M U N D O   D E   A N I M E</Text>
        </View>
        <Text style={styles.heroWhite}>PIXEL</Text>
        <Text style={styles.heroRed}>NO</Text>
        <Text style={styles.heroWhite}>SEKAI</Text>
        <View style={styles.statsRow}>
          {[
            { icon: 'film-outline', val: '10K+', label: 'Títulos' },
            { icon: 'star-outline', val: '4.9', label: 'Rating' },
            { icon: 'sparkles-outline', val: 'HD', label: 'Calidad' },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <View style={styles.statDivider} />}
              <View style={styles.statItem}>
                <View style={styles.statIcon}>
                  <Ionicons name={s.icon as any} size={13} color="#E50914" />
                </View>
                <Text style={styles.statVal}>{s.val}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  leftPanel: { flex: 1, backgroundColor: '#050505', position: 'relative', overflow: 'hidden' },

  topLogo: { position: 'absolute', top: 28, left: 32, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 5 },
  logoIconBox: { width: 28, height: 28, backgroundColor: '#E50914', borderRadius: 0, justifyContent: 'center', alignItems: 'center' },
  logoText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 1.5 },
  brandingBlock: { position: 'absolute', bottom: 72, left: 40, zIndex: 5 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  accentBar: { width: 3, height: 16, backgroundColor: '#E50914' },
  subtitleText: { color: '#E50914', fontSize: 12, fontWeight: '600', letterSpacing: 3 },
  heroWhite: { color: '#fff', fontSize: 67, fontWeight: '900', letterSpacing: -1, lineHeight: 70 },
  heroRed: { color: '#E50914', fontSize: 67, fontWeight: '900', letterSpacing: -1, lineHeight: 70 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 28, gap: 16 },
  statItem: { alignItems: 'center' },
  statIcon: { width: 28, height: 28, borderRadius: 0, borderWidth: 1, borderColor: 'rgba(229, 9, 20, 0.4)', justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  statVal: { color: '#fff', fontSize: 14, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 38, backgroundColor: 'rgba(255,255,255,0.1)' },
});
