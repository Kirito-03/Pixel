import { useState, useRef, useEffect } from 'react';
import {
    Platform,
    Alert,
    Vibration,
    useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useProfile } from '../contexts/ProfileContext';
import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../contexts/AdminContext';
import databaseService from '../services/databaseService';
import { requestPasswordReset, requestEmailVerification } from '../services/auth';
import { auth } from '../services/firebase';

export const useProfileScreenLogic = () => {
    const navigation = useNavigation();
    const { colors, theme } = useTheme();
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [updatingAvatar, setUpdatingAvatar] = useState(false);
    const [avatarKey, setAvatarKey] = useState(0); // Para forzar el re-renderizado de la imagen
    const [imageError, setImageError] = useState(false); // Para manejar errores de carga
    const { currentProfile, setCurrentProfile, clearCurrentProfile, adultContentEnabled, setAdultContentEnabled } = useProfile();
    const { logout, user } = useAuth();
    const { checkAdminStatus } = useAdmin();
    const fileInputRef = useRef<any>(null);

    const { width } = useWindowDimensions();
    const isSmallScreen = width < 768;
    const [accountModalVisible, setAccountModalVisible] = useState(false);
    const [logoutVisible, setLogoutVisible] = useState(false);
    const [logoutLoading, setLogoutLoading] = useState(false);

    // Añade un parámetro de cache-busting a la URL para forzar refresco en Android
    const appendCacheBust = (url: string) => {
        try {
            // Si ya existe algún query, añadimos usando &; si no, usamos ?
            const hasQuery = url.includes('?');
            const sep = hasQuery ? '&' : '?';
            // Usar avatarKey para que solo cambie cuando el usuario actualiza el avatar
            return `${url}${sep}cb=${avatarKey}`;
        } catch {
            return url;
        }
    };

    // Función para obtener la URL del avatar, con fallback si es necesario
    const getAvatarUrl = () => {
        if (!currentProfile?.avatar_url) {
            return appendCacheBust('https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png');
        }

        if (currentProfile.avatar_url.startsWith('data:')) {
            return currentProfile.avatar_url;
        }
        if (currentProfile.avatar_url.startsWith('http')) {
            return appendCacheBust(currentProfile.avatar_url);
        }
        return currentProfile.avatar_url;
    };

    // Función para manejar la imagen seleccionada (común para web y móvil)
    const processSelectedImage = async (imageSource: string | File) => {
        if (!currentProfile) return;

        setUpdatingAvatar(true);
        try {
            // Subir la imagen al servidor (acepta tanto URI string como File object)
            const uploadResult = await databaseService.uploadAvatar(imageSource);

            console.log('Imagen subida, URL:', uploadResult.url);

            // Actualizar el perfil con la nueva URL del avatar
            await databaseService.updateProfile(currentProfile.id, {
                avatar_url: uploadResult.url,
            });

            // Actualizar el perfil en el contexto con la nueva URL
            const updatedProfile = {
                ...currentProfile,
                avatar_url: uploadResult.url,
            };

            console.log('Actualizando perfil en contexto:', updatedProfile);
            await setCurrentProfile(updatedProfile);

            // Forzar actualización de la imagen incrementando la key
            setAvatarKey(prev => prev + 1);

            // Prefetch explícito para ayudar a RN/Android a refrescar la imagen
            try {
                // Import Image dynamically or use global Image if available (it is in RN)
                // Check if we can import Image here or just suppress the error
                // Actually, we should import Image at top for prefetch
                const { Image } = require('react-native');
                const nextUrl = `${uploadResult.url}${uploadResult.url.includes('?') ? '&' : '?'}cb=${avatarKey + 1}`;
                Image.prefetch(nextUrl);
                console.log('Prefetch de nuevo avatar:', nextUrl);
            } catch (e) {
                // Ignorar si prefetch no está disponible
            }
            setImageError(false); // Resetear el error para intentar cargar la nueva imagen

            // Pequeño delay para asegurar que el estado se actualice
            await new Promise(resolve => setTimeout(resolve, 200));

            Alert.alert('Éxito', 'Avatar actualizado correctamente');
        } catch (error) {
            console.error('Error al actualizar avatar:', error);
            Alert.alert('Error', 'No se pudo actualizar el avatar. Por favor intenta nuevamente.');
        } finally {
            setUpdatingAvatar(false);
        }
    };

    // Función para web: manejar input file
    const handleWebFileSelect = async (event: any) => {
        const file = event.target?.files?.[0];
        if (!file) return;

        // Validar tipo de archivo
        if (!file.type.startsWith('image/')) {
            Alert.alert('Error', 'Por favor selecciona un archivo de imagen');
            return;
        }

        // Validar tamaño (5MB máximo)
        if (file.size > 5 * 1024 * 1024) {
            Alert.alert('Error', 'El archivo es demasiado grande. Máximo 5MB');
            return;
        }

        // En web, pasamos el File object directamente a processSelectedImage
        await processSelectedImage(file as any);

        // Limpiar el input para que se pueda seleccionar el mismo archivo de nuevo
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleLogout = async () => {
        Alert.alert(
            'Cerrar sesión',
            '¿Estás seguro de que quieres cerrar sesión?',
            [
                {
                    text: 'Cancelar',
                    style: 'cancel',
                },
                {
                    text: 'Cerrar sesión',
                    style: 'destructive',
                    onPress: async () => {
                        await clearCurrentProfile();
                        await logout();
                        // El navegador condicional redirige automáticamente a 'Ingreso' cuando user=null
                    },
                },
            ]
        );
    };

    const handleChangeAvatar = async () => {
        if (!currentProfile) return;

        // En web, usar input file nativo
        if (Platform.OS === 'web') {
            if (fileInputRef.current) {
                fileInputRef.current.click();
            }
            return;
        }

        // Para móviles (Android/iOS), usar expo-image-picker
        try {
            // Pedir permisos para acceder a la galería
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (status !== 'granted') {
                Alert.alert(
                    'Permisos requeridos',
                    'Necesitamos acceso a tu galería para cambiar el avatar',
                    [{ text: 'OK' }]
                );
                return;
            }

            // Abrir el picker de imágenes
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'] as any,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) {
                return;
            }

            const imageUri = result.assets[0].uri;
            await processSelectedImage(imageUri);
        } catch (error) {
            console.error('Error al seleccionar imagen:', error);
            Alert.alert('Error', 'No se pudo seleccionar la imagen');
        }
    };

    const handleChangeProfile = async () => {
        try {
            // Limpiar el perfil actual
            await clearCurrentProfile();
            console.log('📱 Limpiando perfil y navegando a ProfileSelection...');

            // Intentar múltiples métodos de navegación
            const parent = navigation.getParent();
            const grandParent = parent?.getParent();

            console.log('📱 Parent existe:', !!parent);
            console.log('📱 GrandParent existe:', !!grandParent);

            // Intentar con el grandParent primero (RootStack)
            if (grandParent) {
                console.log('📱 Usando grandParent para navegar...');
                grandParent.dispatch(
                    CommonActions.reset({
                        index: 0,
                        routes: [
                            {
                                name: 'SeleccionPerfil',
                                // Usar el id del usuario (o fallback al usuario_id del perfil actual)
                                params: {},
                            },
                        ],
                    })
                );
            } else if (parent) {
                console.log('📱 Usando parent para navegar...');
                parent.dispatch(
                    CommonActions.reset({
                        index: 0,
                        routes: [
                            {
                                name: 'SeleccionPerfil',
                                params: {},
                            },
                        ],
                    })
                );
            } else {
                // Último recurso: subir manualmente
                console.log('📱 Subiendo manualmente al root...');
                let rootNavigator = navigation;
                while (rootNavigator.getParent()) {
                    rootNavigator = rootNavigator.getParent();
                }
                rootNavigator.dispatch(
                    CommonActions.reset({
                        index: 0,
                        routes: [
                            {
                                name: 'SeleccionPerfil',
                                params: {},
                            },
                        ],
                    })
                );
            }

            console.log('Navegación completada');
        } catch (error) {
            console.error('Error al navegar:', error);
            Alert.alert('Error', 'No se pudo cambiar de perfil. Intenta de nuevo.');
        }
    };

    const handleAdminLongPress = async () => {
        try {
            const isAdmin = await checkAdminStatus();
            if (isAdmin) {
                if (Platform.OS === 'android') {
                    Vibration.vibrate(12);
                    try {
                        const { ToastAndroid } = require('react-native');
                        ToastAndroid.show('Modo administrador', ToastAndroid.SHORT);
                    } catch (_) {
                    }
                } else if (Platform.OS !== 'web') {
                    Vibration.vibrate(12);
                }

                const navigateToAdmin = (attempt: number) => {
                    try {
                        // @ts-ignore
                        navigation.navigate('Admin');
                    } catch (e) {
                        if (attempt < 3) {
                            setTimeout(() => navigateToAdmin(attempt + 1), 60);
                        }
                    }
                };

                setTimeout(() => navigateToAdmin(0), 0);
            }
            // Si no es admin, no hacer nada (silencioso)
        } catch (error) {
            // Silencioso: no revelar que existe un modo admin
        }
    };

    const handleAdminAccess = async () => {
        try {
            const isAdmin = await checkAdminStatus();
            if (!isAdmin) return;

            const navigateToAdmin = (attempt: number) => {
                try {
                    // @ts-ignore
                    navigation.navigate('Admin');
                } catch (e) {
                    if (attempt < 3) {
                        setTimeout(() => navigateToAdmin(attempt + 1), 60);
                    }
                }
            };

            setTimeout(() => navigateToAdmin(0), 0);
        } catch (_) {
        }
    };

    const handlePasswordReset = async () => {
        const email = user?.email;
        if (!email) { Alert.alert('Error', 'No hay email asociado'); return; }
        try { await requestPasswordReset(email); Alert.alert('Listo', 'Revisa tu correo para restablecer la contraseña'); } catch (e: any) { Alert.alert('Error', e?.message || 'No se pudo enviar el correo'); }
    };

    const handleEmailVerification = async () => {
        try { await requestEmailVerification(); Alert.alert('Listo', 'Enviamos un correo de verificación'); } catch (e: any) { Alert.alert('Error', e?.message || 'No se pudo enviar verificación'); }
    };

    const handleLogoutAction = async () => {
        setLogoutLoading(true);
        try {
            await clearCurrentProfile();
            await logout();
            // El navegador condicional redirige automáticamente a 'Ingreso' cuando user=null
        } catch (e) {
            Alert.alert('Error', 'No se pudo cerrar sesión');
        } finally {
            setLogoutLoading(false);
            setLogoutVisible(false);
        }
    };

    return {
        navigation,
        colors,
        theme,
        isSmallScreen,
        notificationsEnabled, setNotificationsEnabled,
        updatingAvatar,
        avatarKey,
        imageError, setImageError,
        currentProfile,
        user,
        adultContentEnabled, setAdultContentEnabled,
        accountModalVisible, setAccountModalVisible,
        logoutVisible, setLogoutVisible,
        logoutLoading,
        fileInputRef,
        getAvatarUrl,
        handleWebFileSelect,
        handleChangeAvatar,
        handleLogout,
        handleChangeProfile,
        handleAdminLongPress,
        handleAdminAccess,
        handlePasswordReset,
        handleEmailVerification,
        handleLogoutAction,
    };
};

export type ProfileScreenProps = ReturnType<typeof useProfileScreenLogic>;
