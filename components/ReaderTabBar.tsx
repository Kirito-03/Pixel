import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReaderChrome } from '../contexts/ReaderChromeContext';

/** Translate an overlay; never resize the reader when its tabs disappear. */
export default function ReaderTabBar(props: BottomTabBarProps) {
  const { reading, bottomVisible } = useReaderChrome();
  const insets = useSafeAreaInsets();
  const offset = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const native = Platform.OS !== 'web';
  const height = Platform.OS === 'android' ? 60 + insets.bottom : 85;
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => listener.remove();
  }, []);
  useEffect(() => {
    const animation = Animated.timing(offset, { toValue: native && reading && !bottomVisible ? height + 12 : 0,
      duration: reduceMotion ? 0 : 240, useNativeDriver: native });
    animation.start();
    return () => animation.stop();
  }, [reading, bottomVisible, height, reduceMotion, native, offset]);
  return <Animated.View pointerEvents={native && reading && !bottomVisible ? 'none' : 'auto'}
    accessibilityElementsHidden={native && reading && !bottomVisible}
    importantForAccessibility={native && reading && !bottomVisible ? 'no-hide-descendants' : 'auto'}
    style={[native && reading ? { position: 'absolute', left: 0, right: 0, bottom: 0, height, zIndex: 100 } : null,
      { transform: [{ translateY: offset }] }]}>
    <BottomTabBar {...props} />
  </Animated.View>;
}
