import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Storage } from '../services/storage';
import Loader from './Loader';

const { width, height } = Dimensions.get('window');

// ========== ANIMACIÓN WEB (Órbita Cinematográfica) ==========
const WebLoadingAnimation: React.FC = () => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.92)).current;
    const orbitAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const particle1 = useRef(new Animated.Value(0)).current;
    const particle2 = useRef(new Animated.Value(0)).current;
    const particle3 = useRef(new Animated.Value(0)).current;
    const glowAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 1600,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 8,
                tension: 28,
                useNativeDriver: true,
            }),
        ]).start();

        Animated.loop(
            Animated.timing(orbitAnim, {
                toValue: 1,
                duration: 8000,
                useNativeDriver: true,
            })
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.05,
                    duration: 2000,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 2000,
                    useNativeDriver: true,
                }),
            ])
        ).start();

        Animated.loop(
            Animated.timing(particle1, {
                toValue: 1,
                duration: 6000,
                useNativeDriver: true,
            })
        ).start();

        Animated.loop(
            Animated.timing(particle2, {
                toValue: 1,
                duration: 8000,
                useNativeDriver: true,
            })
        ).start();

        Animated.loop(
            Animated.timing(particle3, {
                toValue: 1,
                duration: 10000,
                useNativeDriver: true,
            })
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(glowAnim, {
                    toValue: 1,
                    duration: 3000,
                    useNativeDriver: true,
                }),
                Animated.timing(glowAnim, {
                    toValue: 0,
                    duration: 3000,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    const orbitRotate = orbitAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const particle1Rotate = particle1.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const particle2Rotate = particle2.interpolate({
        inputRange: [0, 1],
        outputRange: ['360deg', '0deg'],
    });

    const particle3Rotate = particle3.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const glowOpacity = glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.5, 1],
    });

    return (
        <LinearGradient
            colors={['#000000', '#0a0000', '#000000']}
            style={styles.container}
        >
            <Animated.View
                style={[
                    styles.content,
                    {
                        opacity: fadeAnim,
                        transform: [{ scale: scaleAnim }],
                    },
                ]}
            >
                <Animated.View
                    style={[
                        styles.webLogoContainer,
                        {
                            transform: [{ scale: pulseAnim }],
                        },
                    ]}
                >
                    <Text style={styles.webLogoText}>PIXEL NO SEKAI</Text>
                </Animated.View>

                <View style={styles.orbitSystem}>
                    <Animated.View style={[styles.orbitCenter, { opacity: glowOpacity }]} />

                    <Animated.View
                        style={[
                            styles.orbitRing,
                            {
                                transform: [{ rotate: orbitRotate }],
                            },
                        ]}
                    >
                        <View style={styles.orbitDot} />
                    </Animated.View>

                    <Animated.View
                        style={[
                            styles.orbitRing2,
                            {
                                transform: [{ rotate: particle1Rotate }],
                            },
                        ]}
                    >
                        <View style={styles.orbitDot2} />
                    </Animated.View>

                    <Animated.View
                        style={[
                            styles.particleOrbit,
                            {
                                transform: [{ rotate: particle2Rotate }],
                            },
                        ]}
                    >
                        <View style={styles.particleDot} />
                    </Animated.View>

                    <Animated.View
                        style={[
                            styles.particleOrbit2,
                            {
                                transform: [{ rotate: particle3Rotate }],
                            },
                        ]}
                    >
                        <View style={styles.particleDot} />
                    </Animated.View>
                </View>

                <Animated.Text
                    style={[
                        styles.webLoadingText,
                        {
                            opacity: glowOpacity,
                        },
                    ]}
                >
                    CARGANDO UNIVERSO
                </Animated.Text>
            </Animated.View>

            <View style={styles.speedLines}>
                {[...Array(12)].map((_, i) => (
                    <View
                        key={i}
                        style={[
                            styles.speedLine,
                            {
                                left: `${i * 8.33}%`,
                                opacity: 0.03,
                            },
                        ]}
                    />
                ))}
            </View>
        </LinearGradient>
    );
};

// ========== ANIMACIÓN MÓVIL (Universo y Estrellas) ==========
const MobileLoadingAnimation: React.FC = () => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const planetAnim = useRef(new Animated.Value(0)).current;
    const starsAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const glowAnim = useRef(new Animated.Value(0)).current;
    const meteor1 = useRef(new Animated.Value(0)).current;
    const meteor2 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 1400,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 7,
                tension: 25,
                useNativeDriver: true,
            }),
        ]).start();

        Animated.loop(
            Animated.timing(planetAnim, {
                toValue: 1,
                duration: 12000,
                useNativeDriver: true,
            })
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(starsAnim, {
                    toValue: 1,
                    duration: 2000,
                    useNativeDriver: true,
                }),
                Animated.timing(starsAnim, {
                    toValue: 0,
                    duration: 2000,
                    useNativeDriver: true,
                }),
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.04,
                    duration: 2000,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 2000,
                    useNativeDriver: true,
                }),
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(glowAnim, {
                    toValue: 1,
                    duration: 2500,
                    useNativeDriver: true,
                }),
                Animated.timing(glowAnim, {
                    toValue: 0,
                    duration: 2500,
                    useNativeDriver: true,
                }),
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(meteor1, {
                    toValue: 1,
                    duration: 3000,
                    useNativeDriver: true,
                }),
                Animated.timing(meteor1, {
                    toValue: 0,
                    duration: 0,
                    useNativeDriver: true,
                }),
                Animated.delay(2000),
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.delay(1500),
                Animated.timing(meteor2, {
                    toValue: 1,
                    duration: 2500,
                    useNativeDriver: true,
                }),
                Animated.timing(meteor2, {
                    toValue: 0,
                    duration: 0,
                    useNativeDriver: true,
                }),
                Animated.delay(2500),
            ])
        ).start();
    }, []);

    const planetRotate = planetAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const starsOpacity = starsAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 0.8],
    });

    const glowOpacity = glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.4, 0.9],
    });

    const meteor1Translate = meteor1.interpolate({
        inputRange: [0, 1],
        outputRange: [-100, height],
    });

    const meteor1Opacity = meteor1.interpolate({
        inputRange: [0, 0.2, 0.8, 1],
        outputRange: [0, 0.8, 0.8, 0],
    });

    const meteor2Translate = meteor2.interpolate({
        inputRange: [0, 1],
        outputRange: [-80, height],
    });

    const meteor2Opacity = meteor2.interpolate({
        inputRange: [0, 0.2, 0.8, 1],
        outputRange: [0, 0.7, 0.7, 0],
    });

    return (
        <LinearGradient colors={['#000000', '#0a0a1a', '#000000']} style={styles.container}>
            <View style={styles.starField}>
                {[...Array(20)].map((_, i) => (
                    <Animated.View
                        key={i}
                        style={[
                            styles.star,
                            {
                                left: `${Math.random() * 100}%`,
                                top: `${Math.random() * 100}%`,
                                opacity: starsOpacity,
                            },
                        ]}
                    />
                ))}
            </View>

            <Animated.View
                style={[
                    styles.meteor,
                    {
                        left: '20%',
                        transform: [{ translateY: meteor1Translate }],
                        opacity: meteor1Opacity,
                    },
                ]}
            />
            <Animated.View
                style={[
                    styles.meteor,
                    {
                        left: '70%',
                        transform: [{ translateY: meteor2Translate }],
                        opacity: meteor2Opacity,
                    },
                ]}
            />

            <Animated.View
                style={[
                    styles.content,
                    {
                        opacity: fadeAnim,
                        transform: [{ scale: scaleAnim }],
                    },
                ]}
            >
                <Animated.View
                    style={[
                        styles.mobileLogoContainer,
                        {
                            transform: [{ scale: pulseAnim }],
                        },
                    ]}
                >
                    <Text style={styles.mobileLogoText}>PIXEL NO SEKAI</Text>
                    <View style={styles.mobileLogoUnderline} />
                </Animated.View>

                <View style={styles.planetSystem}>
                    <Animated.View style={[styles.planet, { opacity: glowOpacity }]} />

                    <Animated.View
                        style={[
                            styles.orbitRingMobile,
                            {
                                transform: [{ rotate: planetRotate }],
                            },
                        ]}
                    >
                        <View style={styles.satellite} />
                    </Animated.View>

                    <Animated.View
                        style={[
                            styles.orbitRingMobile2,
                            {
                                transform: [
                                    {
                                        rotate: planetAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: ['360deg', '0deg'],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
                        <View style={styles.satellite2} />
                    </Animated.View>
                </View>

                <Animated.Text style={[styles.mobileLoadingText, { opacity: glowOpacity }]}>
                    Explorando el universo
                </Animated.Text>
            </Animated.View>
        </LinearGradient>
    );
};

export const LoadingScreen: React.FC = () => {
    const hasSeenIntro = Storage.getString('hasSeenAppIntro');

    useEffect(() => {
        if (!hasSeenIntro) {
            Storage.setString('hasSeenAppIntro', 'true');
        }
    }, [hasSeenIntro]);

    if (hasSeenIntro) {
        return (
            <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                <Loader />
            </View>
        );
    }

    return Platform.OS === 'web' ? <WebLoadingAnimation /> : <MobileLoadingAnimation />;
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },

    // ===== ESTILOS WEB =====
    webLogoContainer: {
        alignItems: 'center',
        marginBottom: 80,
    },
    webLogoText: {
        fontSize: 48,
        fontWeight: 'bold',
        color: '#FFFFFF',
        letterSpacing: 8,
        textAlign: 'center',
        textShadowColor: 'rgba(229, 9, 20, 0.3)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 15,
    },
    orbitSystem: {
        width: 200,
        height: 200,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 60,
    },
    orbitCenter: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#E50914',
        shadowColor: '#E50914',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 20,
    },
    orbitRing: {
        position: 'absolute',
        width: 150,
        height: 150,
        borderRadius: 75,
        borderWidth: 1,
        borderColor: 'rgba(229, 9, 20, 0.3)',
        justifyContent: 'flex-start',
        alignItems: 'center',
    },
    orbitDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#E50914',
        shadowColor: '#E50914',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
    },
    orbitRing2: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 1,
        borderColor: 'rgba(229, 9, 20, 0.2)',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    orbitDot2: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#FFFFFF',
        shadowColor: '#FFFFFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 6,
    },
    particleOrbit: {
        position: 'absolute',
        width: 90,
        height: 90,
        borderRadius: 45,
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
    },
    particleOrbit2: {
        position: 'absolute',
        width: 180,
        height: 180,
        borderRadius: 90,
        justifyContent: 'flex-end',
        alignItems: 'flex-start',
    },
    particleDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(229, 9, 20, 0.6)',
    },
    webLoadingText: {
        fontSize: 15,
        fontWeight: '300',
        color: '#FFFFFF',
        letterSpacing: 4,
        textAlign: 'center',
    },
    speedLines: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    speedLine: {
        position: 'absolute',
        width: 1,
        height: '100%',
        backgroundColor: '#E50914',
    },

    // ===== ESTILOS MÓVIL =====
    starField: {
        ...StyleSheet.absoluteFillObject,
    },
    star: {
        position: 'absolute',
        width: 2,
        height: 2,
        borderRadius: 1,
        backgroundColor: '#FFFFFF',
    },
    meteor: {
        position: 'absolute',
        width: 3,
        height: 60,
        backgroundColor: '#E50914',
        shadowColor: '#E50914',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
        transform: [{ rotate: '20deg' }],
    },
    mobileLogoContainer: {
        alignItems: 'center',
        marginBottom: 70,
    },
    mobileLogoText: {
        fontSize: 34,
        fontWeight: 'bold',
        color: '#FFFFFF',
        letterSpacing: 5,
        textAlign: 'center',
        textShadowColor: 'rgba(229, 9, 20, 0.4)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 12,
    },
    mobileLogoUnderline: {
        width: width * 0.7,
        height: 3,
        backgroundColor: '#E50914',
        marginTop: 12,
        borderRadius: 2,
        shadowColor: '#E50914',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
    },
    planetSystem: {
        width: 150,
        height: 150,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 50,
    },
    planet: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#E50914',
        shadowColor: '#E50914',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 25,
    },
    orbitRingMobile: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 1,
        borderColor: 'rgba(229, 9, 20, 0.3)',
        justifyContent: 'flex-start',
        alignItems: 'center',
    },
    satellite: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FFFFFF',
        shadowColor: '#FFFFFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
    },
    orbitRingMobile2: {
        position: 'absolute',
        width: 90,
        height: 90,
        borderRadius: 45,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    satellite2: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(229, 9, 20, 0.8)',
    },
    mobileLoadingText: {
        fontSize: 15,
        fontWeight: '400',
        color: '#FFFFFF',
        letterSpacing: 2,
        textAlign: 'center',
    },
});
