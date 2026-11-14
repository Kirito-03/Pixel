import React, { useRef } from 'react';
import { TouchableOpacity, TouchableOpacityProps, Animated } from 'react-native';

interface PressableScaleProps extends TouchableOpacityProps {
    scaleValue?: number;
    duration?: number;
    children: React.ReactNode;
}

/**
 * Componente reutilizable para botones con animación de escala premium
 * Proporciona feedback visual al presionar mediante spring animation
 */
export default function PressableScale({
    scaleValue = 0.95,
    duration = 100,
    children,
    onPressIn,
    onPressOut,
    ...props
}: PressableScaleProps) {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePressIn = (e: any) => {
        Animated.spring(scaleAnim, {
            toValue: scaleValue,
            useNativeDriver: true,
            friction: 3,
        }).start();
        onPressIn?.(e);
    };

    const handlePressOut = (e: any) => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            friction: 3,
        }).start();
        onPressOut?.(e);
    };

    return (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity
                {...props}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={0.9}
            >
                {children}
            </TouchableOpacity>
        </Animated.View>
    );
}
