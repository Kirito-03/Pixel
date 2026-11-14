import { useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import databaseService from '../services/databaseService';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { Profile } from '../contexts/ProfileContext';

export const useProfileManagement = () => {
  const { user } = useAuth();
  const userId = user?.uid;

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profilesVersion, setProfilesVersion] = useState(0);

  const loadProfiles = useCallback(async () => {
    if (!userId) {
      setProfiles([]); // Limpiar perfiles si no hay usuario
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const rows = await databaseService.getProfiles(parseInt(userId, 10));
      const mapped: Profile[] = rows.map((p: any) => ({
                id: p.id,
                name: p.name,
                avatar_url: p.avatar_url,
                usuario_id: p.usuario_id,
              }));
      setProfiles(mapped);
      setProfilesVersion((v) => v + 1);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'No se pudieron cargar los perfiles';
      setError(errorMessage);
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadProfiles();
    }, [loadProfiles, userId])
  );

  const uploadImage = async (imageUri: string): Promise<string> => {
    let avatarUrl: string;
    if (Platform.OS === 'web' && imageUri.startsWith('data:')) {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const uploadResult = await databaseService.uploadAvatar(file);
      avatarUrl = uploadResult.url;
    } else if (typeof imageUri === 'string') {
      const uploadResult = await databaseService.uploadAvatar(imageUri);
      avatarUrl = uploadResult.url;
    } else {
      throw new Error('Tipo de imagen no soportado');
    }
    return avatarUrl;
  };

  const createProfile = async (name: string, imageUri: string) => {
    if (!name.trim() || !imageUri) {
      throw new Error('El nombre y la imagen son requeridos.');
    }
    if (profiles.length >= 5) {
      throw new Error('Solo puedes tener hasta 5 perfiles.');
    }

    const originalProfiles = [...profiles];
    const tempProfile: Profile = { id: Date.now(), name: name.trim(), avatar_url: imageUri, usuario_id: parseInt(userId || '0') };
    setProfiles([...profiles, tempProfile]);

    try {
      const avatarUrl = await uploadImage(imageUri);
      await databaseService.createProfile({
        usuario_id: parseInt(userId, 10),
        name: name.trim(),
        avatar_url: avatarUrl,
      });
      await loadProfiles(); // Recargar para obtener el ID real
    } catch (error) {
      setProfiles(originalProfiles);
      throw error;
    }
  };

  const updateProfile = async (profileId: number, name: string, imageUri?: string) => {
    const originalProfiles = [...profiles];
    const updatedProfiles = profiles.map(p =>
      p.id === profileId ? { ...p, name: name.trim(), avatar_url: imageUri || p.avatar_url } : p
    );
    setProfiles(updatedProfiles);

    try {
      let avatarUrl: string | undefined = undefined;
      if (imageUri && imageUri !== originalProfiles.find(p=>p.id === profileId)?.avatar_url) {
          avatarUrl = await uploadImage(imageUri);
      }

      await databaseService.updateProfile(profileId, {
          name: name.trim(),
          avatar_url: avatarUrl,
      });

      await loadProfiles(); // Recargar para asegurar consistencia
    } catch (error) {
      setProfiles(originalProfiles);
      throw error;
    }
  };

  const deleteProfile = async (profileId: number) => {
    const originalProfiles = [...profiles];
    const updatedProfiles = profiles.filter(p => p.id !== profileId);
    setProfiles(updatedProfiles);

    try {
      await databaseService.deleteProfile(profileId);
    } catch (error) {
      setProfiles(originalProfiles);
      throw error;
    }
  };

  const getCorrectedAvatarUrl = (avatarUrl: string | undefined): string => {
    if (!avatarUrl) return '';
    if (avatarUrl.startsWith('data:')) return avatarUrl;
    if (avatarUrl.startsWith('http')) {
        try {
            const hasQuery = avatarUrl.includes('?');
            const sep = hasQuery ? '&' : '?';
            return `${avatarUrl}${sep}cb=${profilesVersion}`;
          } catch {
            return avatarUrl;
          }
    }
    return avatarUrl;
  };

  return {
    profiles,
    loading,
    error,
    loadProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
    getCorrectedAvatarUrl,
  };
};
