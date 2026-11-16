import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useProfile, Profile } from '../contexts/ProfileContext';
import { useAuth } from '../contexts/AuthContext';
import { useProfileManagement } from '../hooks/useProfileManagement';
import { CreateProfileModal } from '../components/modals/CreateProfileModal';
import { DeleteProfileModal } from '../components/modals/DeleteProfileModal';
import { AnimatedProfileCard } from '../components/AnimatedProfileCard';
import AnimatedLeftPanel from '../components/AnimatedLeftPanel';
import Loader from '../components/Loader';

interface ProfileSelectionScreenProps {
  navigation: any;
}

const ProfileSelectionScreen: React.FC<ProfileSelectionScreenProps> = ({ navigation }) => {
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { setCurrentProfile } = useProfile();
  const { profiles, loading, error, loadProfiles, createProfile, deleteProfile, getCorrectedAvatarUrl } = useProfileManagement();

  const [showCreateModal, setShowCreateModal] = useState(false);
  useEffect(() => { if (!loading && !error && profiles.length === 0) setShowCreateModal(true); }, [loading, error, profiles.length]);
  const [newProfileName, setNewProfileName] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  const [addHovered, setAddHovered] = useState(false);
  const [logoutHovered, setLogoutHovered] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleSelectImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permisos requeridos', 'Necesitamos acceso a tu galería.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setSelectedImageUri(result.assets[0].uri);
    }
  };

  const handleWebFileSelect = (event: any) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      Alert.alert('Error', 'Por favor selecciona un archivo de imagen');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      Alert.alert('Error', 'El archivo es demasiado grande. Máximo 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImageUri(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateProfile = async () => {
    if (!newProfileName.trim() || !selectedImageUri) {
      Alert.alert('Error', 'El nombre y la imagen son requeridos.');
      return;
    }
    setCreating(true);
    try {
      await createProfile(newProfileName, selectedImageUri);
      setShowCreateModal(false);
      setNewProfileName('');
      setSelectedImageUri(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo crear el perfil';
      Alert.alert('Error', msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteTargetId === null) return;
    setDeleting(true);
    try {
      await deleteProfile(deleteTargetId);
      setShowDeleteModal(false);
      setDeleteTargetId(null);
      Alert.alert('Eliminado', 'El perfil fue eliminado correctamente');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo eliminar el perfil';
      Alert.alert('Error', msg);
    } finally {
      setDeleting(false);
    }
  };

  const handleSelectProfile = async (profile: Profile) => {
    await setCurrentProfile(profile);
    // The root navigator opens content only after an explicit profile selection.
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={StyleSheet.absoluteFillObject}>
          <AnimatedLeftPanel fullScreenMode={true} />
        </View>
        <View style={styles.loadingContainer}>
          <Loader onDark />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Background Glitch Engine */}
      <View style={StyleSheet.absoluteFillObject}>
        <AnimatedLeftPanel fullScreenMode={true} />
      </View>

      <View style={styles.mainContentContainer}>
        {/* Top Header */}
        <View style={[styles.topBar, { paddingHorizontal: compact ? 20 : 40, paddingTop: insets.top + (compact ? 16 : 32), gap: 16, flexWrap: 'wrap' }]}>
          <View style={[styles.topLogo, { flexShrink: 1 }]}>
            <View style={styles.logoIconBox}>
              <Ionicons name="play" size={11} color="#fff" />
            </View>
            <Text numberOfLines={1} style={[styles.logoText, { fontSize: compact ? 12 : 14, letterSpacing: compact ? 0.8 : 1.5, flexShrink: 1 }]}>PIXEL NO SEKAI</Text>
          </View>
          <Pressable
            accessibilityRole="button" accessibilityLabel="Cerrar sesión"
            style={[styles.logoutButton, { minHeight: 44, paddingHorizontal: compact ? 8 : 16, flexShrink: 0 }, logoutHovered && styles.logoutButtonHover]}
            onPress={async () => {
              await logout();
              // El navegador condicional redirige automáticamente cuando user=null
            }}
            // @ts-ignore
            onHoverIn={() => setLogoutHovered(true)}
            onHoverOut={() => setLogoutHovered(false)}
          >
            <Ionicons name="log-out-outline" size={16} color={logoutHovered ? "#fff" : "rgba(255,255,255,0.5)"} />
            <Text style={[styles.logoutText, logoutHovered && styles.logoutTextHover]}>{compact ? 'Salir' : 'CERRAR SESIÓN'}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Main Titles */}
          <View style={styles.header}>
            <View style={styles.welcomeRow}>
              <View style={styles.welcomeLine} />
              <Text style={styles.welcomeText}>BIENVENIDO</Text>
              <View style={styles.welcomeLine} />
            </View>
            <Text style={styles.titleWhite}>¿QUIÉN ESTÁ</Text>
            <Text style={styles.titleRed}>VIENDO?</Text>
          </View>

          {!!error && <View style={{ padding: 20, maxWidth: 420, gap: 12 }}><Text style={{ color: '#ddd', textAlign: 'center' }}>No se pudieron cargar tus perfiles.</Text><TouchableOpacity accessibilityRole="button" onPress={loadProfiles} style={{ padding: 14, backgroundColor: '#202b29' }}><Text style={{ color: '#fff', textAlign: 'center' }}>Reintentar</Text></TouchableOpacity></View>}
          {!error && profiles.length === 0 && <Text style={{ color: '#bbb', textAlign: 'center', paddingHorizontal: 24, marginBottom: 24 }}>Crea tu primer perfil para empezar.</Text>}
          {/* Profiles Grid */}
          <View style={styles.profilesContainer}>
            {profiles.map((profile, index) => (
              <AnimatedProfileCard
                key={profile.id}
                profile={profile}
                index={index}
                onPress={() => handleSelectProfile(profile)}
                onLongPress={() => {
                  setDeleteTargetId(profile.id);
                  setShowDeleteModal(true);
                }}
                getCorrectedAvatarUrl={getCorrectedAvatarUrl}
              />
            ))}

            {profiles.length < 5 && (
              <View style={styles.addProfileWrapper}>
                <Pressable
                  style={styles.addProfileCard}
                  onPress={() => setShowCreateModal(true)}
                  // @ts-ignore
                  onHoverIn={() => setAddHovered(true)}
                  onHoverOut={() => setAddHovered(false)}
                >
                  <View style={[styles.addAvatarContainer, addHovered && styles.addAvatarContainerHover]}>
                    <Ionicons name="add" size={32} color={addHovered ? "#fff" : "rgba(255,255,255,0.4)"} />
                    {addHovered && (
                      <View style={styles.hoverCornerTopRight} />
                    )}
                  </View>
                  <Text style={[styles.addProfileText, addHovered && styles.addProfileTextHover]}>Agregar perfil</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Decorative Pagination */}
          <View style={styles.pagination}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
        </ScrollView>
      </View>

      <CreateProfileModal
        visible={showCreateModal}
        creating={creating}
        newProfileName={newProfileName}
        selectedImageUri={selectedImageUri}
        onClose={() => setShowCreateModal(false)}
        onConfirm={handleCreateProfile}
        setNewProfileName={setNewProfileName}
        handleSelectImage={handleSelectImage}
        handleWebFileSelect={handleWebFileSelect}
      />

      <DeleteProfileModal
        visible={showDeleteModal}
        deleting={deleting}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
    alignItems: 'center',
  },
  mainContentContainer: {
    width: '100%',
    flex: 1,
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 40,
    width: '100%',
  },
  topLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoIconBox: {
    width: 28,
    height: 28,
    backgroundColor: '#E50914',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
  },
  logoutButtonHover: {
    borderColor: 'rgba(255,255,255,0.4)',
  },
  logoutText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  logoutTextHover: {
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 60,
    alignItems: 'center',
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  welcomeLine: {
    height: 1,
    width: 40,
    backgroundColor: '#E50914',
  },
  welcomeText: {
    color: '#E50914',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
  },
  titleWhite: {
    fontSize: Platform.OS === 'web' ? 56 : 36,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
    lineHeight: Platform.OS === 'web' ? 60 : 40,
  },
  titleRed: {
    fontSize: Platform.OS === 'web' ? 56 : 36,
    fontWeight: '900',
    color: '#E50914',
    letterSpacing: -1,
    lineHeight: Platform.OS === 'web' ? 60 : 40,
  },
  profilesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 20,
    width: '100%',
    marginBottom: 80,
  },
  addProfileWrapper: {
    alignItems: 'center',
    width: 140,
    marginHorizontal: 10,
  },
  addProfileCard: {
    alignItems: 'center',
    width: '100%',
  },
  addAvatarContainer: {
    width: 140,
    height: 140,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
    position: 'relative',
  },
  addAvatarContainerHover: {
    borderColor: '#E50914',
  },
  addProfileText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  addProfileTextHover: {
    color: '#fff',
  },
  hoverCornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 24,
    height: 24,
    backgroundColor: '#E50914',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 12,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dotActive: {
    backgroundColor: '#E50914',
  },
});

export default ProfileSelectionScreen;
