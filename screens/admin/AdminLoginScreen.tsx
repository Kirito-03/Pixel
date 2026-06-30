import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAdmin } from '../../contexts/AdminContext';
import { useNavigation } from '@react-navigation/native';
import { adminColors } from '../../theme';

export default function AdminLoginScreen() {
    const [isLoading, setIsLoading] = useState(true); // Start loading immediately
    const { isAdmin, checkAdminStatus } = useAdmin();
    const navigation = useNavigation();
    const enter = React.useRef(new Animated.Value(0)).current

    // Intentar login automático al montar
    React.useEffect(() => {
        const tryAutoLogin = async () => {
            if (isAdmin) {
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'AdminDashboard' } as any]
                });
                return;
            }

            // Forzar chequeo (que ahora incluye el sync con firebase)
            const success = await checkAdminStatus();
            if (success) {
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'AdminDashboard' } as any]
                });
            } else {
                setIsLoading(false); // Solo mostrar UI si falló el auto-login
            }
        };

        tryAutoLogin();
    }, [isAdmin]);

    React.useEffect(() => {
        if (isLoading) return
        enter.setValue(0)
        Animated.timing(enter, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
        }).start()
    }, [enter, isLoading])

    const handleRetry = async () => {
        setIsLoading(true);
        const success = await checkAdminStatus();
        if (!success) {
            setIsLoading(false);
            Alert.alert('Acceso Denegado', 'No tienes permisos de administrador.');
        }
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.content}>
                    <ActivityIndicator size="large" color={adminColors.primary} />
                    <Text style={{ textAlign: 'center', marginTop: 20, color: adminColors.textSecondary }}>
                        Verificando credenciales...
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <Animated.View
                style={[
                    styles.content,
                    {
                        opacity: enter,
                        transform: [
                            {
                                translateY: enter.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [10, 0],
                                }),
                            },
                        ],
                    },
                ]}
            >
                <View style={styles.header}>
                    <View style={styles.iconContainer}>
                        <Ionicons name="lock-closed" size={64} color={adminColors.primary} />
                    </View>
                    <Text style={styles.title}>Acceso Restringido</Text>
                    <Text style={styles.subtitle}>Solo personal autorizado</Text>
                </View>

                <View style={styles.loginSection}>
                    <Text style={styles.infoText}>
                        No pudimos verificar tus permisos de administrador automáticamente.
                    </Text>
                    
                    <TouchableOpacity
                        style={styles.googleButton}
                        onPress={handleRetry}
                        activeOpacity={0.92}
                    >
                        <Text style={styles.googleButtonText}>Reintentar Verificación</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.googleButton, styles.secondaryButton]}
                        onPress={() => navigation.goBack()}
                        activeOpacity={0.92}
                    >
                        <Text style={styles.secondaryButtonText}>Volver</Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: adminColors.background,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },
    header: {
        alignItems: 'center',
        marginBottom: 48,
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: adminColors.surface,
        borderWidth: 1,
        borderColor: adminColors.border,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    title: {
        fontSize: 32,
        fontWeight: '700',
        color: adminColors.text,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: adminColors.textSecondary,
        fontWeight: '400',
    },
    loginSection: {
        backgroundColor: adminColors.surface,
        borderRadius: 16,
        padding: 32,
        borderWidth: 1,
        borderColor: adminColors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 6,
    },
    loginTitle: {
        fontSize: 24,
        fontWeight: '600',
        color: '#1a1a1a',
        marginBottom: 8,
    },
    loginSubtitle: {
        fontSize: 14,
        color: '#666666',
        marginBottom: 32,
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: adminColors.primary,
        borderWidth: 1,
        borderColor: adminColors.primary,
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
    },
    googleIcon: {
        width: 24,
        height: 24,
        marginRight: 12,
    },
    googleButtonText: {
        fontSize: 16,
        fontWeight: '500',
        color: '#FFFFFF',
    },
    secondaryButton: {
        backgroundColor: adminColors.ink,
        borderColor: adminColors.ink,
        marginTop: 10,
        marginBottom: 0,
    },
    secondaryButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#F8F9FA',
        borderRadius: 12,
        padding: 16,
        gap: 12,
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        color: adminColors.textSecondary,
        lineHeight: 20,
    },
});
