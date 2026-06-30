import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useProfile, Profile } from '../contexts/ProfileContext';
import { useAuth } from '../contexts/AuthContext';
import { useProfileManagement } from '../hooks/useProfileManagement';
import { CreateProfileModal } from '../components/modals/CreateProfileModal';
import { DeleteProfileModal } from '../components/modals/DeleteProfileModal';
import { AnimatedProfileCard } from '../components/AnimatedProfileCard';
import AnimatedLeftPanel from '../components/AnimatedLeftPanel';

interface ProfileSelectionScreenProps {
  navigation: any;
}

const ProfileSelectionScreen: React.FC<ProfileSelectionScreenProps> = ({ navigation }) => {
  const { logout } = useAuth();
  const { setCurrentProfile } = useProfile();
  const { profiles, loading, createProfile, deleteProfile, getCorrectedAvatarUrl } = useProfileManagement();

  const [showCreateModal, setShowCreateModal] = useState(false);
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
    navigation.reset({
      index: 0,
      routes: [{ name: 'Principal', params: { selectedProfile: profile } }],
    });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={StyleSheet.absoluteFillObject}>
          <AnimatedLeftPanel fullScreenMode={true} />
        </View>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingBox}>
            <View style={styles.loadingSpinnerWrap}>
              <View style={styles.loadingSpinnerCore} />
            </View>
            <Text style={styles.loadingText}>INICIALIZANDO</Text>
            <Text style={styles.loadingSubText}>Sincronizando base de datos central...</Text>
          </View>
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
        <View style={styles.topBar}>
          <View style={styles.topLogo}>
            <View style={styles.logoIconBox}>
              <Ionicons name="play" size={11} color="#fff" />
            </View>
            <Text style={styles.logoText}>PIXEL NO SEKAI</Text>
          </View>
          <Pressable
            style={[styles.logoutButton, logoutHovered && styles.logoutButtonHover]}
            onPress={async () => {
              await logout();
              navigation.replace('Ingreso');
            }}
            // @ts-ignore
            onHoverIn={() => setLogoutHovered(true)}
            onHoverOut={() => setLogoutHovered(false)}
          >
            <Ionicons name="log-out-outline" size={16} color={logoutHovered ? "#fff" : "rgba(255,255,255,0.5)"} />
            <Text style={[styles.logoutText, logoutHovered && styles.logoutTextHover]}>CERRAR SESIÓN</Text>
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
  loadingBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(10, 10, 10, 0.8)',
    paddingHorizontal: 40,
    paddingVertical: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.3)',
  },
  loadingSpinnerWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: '#E50914',
    borderRightColor: '#E50914',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  loadingSpinnerCore: {
    width: 10,
    height: 10,
    backgroundColor: '#E50914',
  },
  loadingText: {
    color: '#E50914',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 4,
    marginBottom: 8,
  },
  loadingSubText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    letterSpacing: 1,
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
    fontSize: 56,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
    lineHeight: 60,
  },
  titleRed: {
    fontSize: 56,
    fontWeight: '900',
    color: '#E50914',
    letterSpacing: -1,
    lineHeight: 60,
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
