/**
 * databaseService — Fachada de compatibilidad.
 * 
 * Este archivo mantiene la misma API pública que tenía antes,
 * pero ahora delega a módulos especializados bajo services/db/.
 * 
 * Consumidores existentes (MovieModal, DownloadsScreen, RegisterScreen, etc.)
 * pueden seguir importando `databaseService` sin cambios.
 */
import { axiosInstance } from './db/networkClient';
import { getCurrentBaseURL, resetNetworkConfig } from './db/networkClient';
import { profileService, CreateProfilePayload } from './db/profileService';
import { myListService } from './db/myListService';
import { downloadService } from './db/downloadService';
import { auth, storage } from './firebase';
import { ref as storageRef, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { db } from './firebase';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';

// Re-export para que otros módulos puedan seguir importando desde aquí
export { getCurrentBaseURL };
export type { CreateProfilePayload };

export const databaseService = {
  // ── Red ────────────────────────────────────────────────
  resetNetworkConfig,

  // ── Auth (REST → backend) ──────────────────────────────
  async register(email: string, password: string) {
    const { data } = await axiosInstance.post('/auth/register', { email, password });
    return data;
  },

  async login(email: string, password: string) {
    const { data } = await axiosInstance.post('/auth/login', { email, password });
    return data;
  },

  async validateUser(userId: number) {
    try {
      const { data } = await axiosInstance.get(`/users/${userId}`);
      return data;
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  },

  async forgotPassword(email: string) {
    const { data } = await axiosInstance.post('/auth/forgot-password', { email });
    return data;
  },

  async resetPassword(email: string, token: string, newPassword: string) {
    const { data } = await axiosInstance.post('/auth/reset-password', { email, token, new_password: newPassword });
    return data;
  },

  // ── Perfiles (Firestore) ───────────────────────────────
  getProfiles: profileService.getProfiles.bind(profileService),
  createProfile: profileService.createProfile.bind(profileService),
  updateProfile: profileService.updateProfile.bind(profileService),
  deleteProfile: profileService.deleteProfile.bind(profileService),

  // ── Mi Lista (Firestore) ───────────────────────────────
  getMyList: myListService.getMyList.bind(myListService),
  addToMyList: myListService.addToMyList.bind(myListService),
  removeFromMyList: myListService.removeFromMyList.bind(myListService),

  // ── Descargas (Firestore) ──────────────────────────────
  getDownloads: downloadService.getDownloads.bind(downloadService),
  addToDownloads: downloadService.addToDownloads.bind(downloadService),
  updateDownloadItem: downloadService.updateDownloadItem.bind(downloadService),
  removeFromDownloads: downloadService.removeFromDownloads.bind(downloadService),
  isInDownloads: downloadService.isInDownloads.bind(downloadService),
  addAnimeToDownloads: downloadService.addAnimeToDownloads.bind(downloadService),
  addAnimeSeasonToDownloads: downloadService.addAnimeSeasonToDownloads.bind(downloadService),
  addAnimeEpisodeToDownloads: downloadService.addAnimeEpisodeToDownloads.bind(downloadService),

  // ── Content (Firestore) ────────────────────────────────
  async getAllContent() {
    const ref = collection(db, 'content');
    const snap = await getDocs(ref);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  },

  async getContentByType(type: 'movie' | 'tv' | 'anime') {
    const ref = collection(db, 'content');
    const q = query(ref, where('type', '==', type));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  },

  async addContent(content: {
    title: string;
    type: 'movie' | 'tv' | 'anime';
    overview?: string;
    poster_url?: string;
    backdrop_url?: string;
  }) {
    const payload = { ...content, created_at: serverTimestamp() };
    const ref = collection(db, 'content');
    const res = await addDoc(ref, payload);
    return { id: res.id, ...payload } as any;
  },

  // ── Images (REST → backend) ────────────────────────────
  async saveImageMetadata(imageData: {
    filename: string;
    original_name: string;
    mime_type: string;
    size: number;
    width?: number;
    height?: number;
    url: string;
    type: 'poster' | 'backdrop' | 'avatar' | 'thumbnail';
    entity_id?: number;
    entity_type?: 'contenido' | 'perfil';
  }) {
    const { data } = await axiosInstance.post('/images', imageData);
    return data;
  },

  async getImagesByEntity(entityType: 'contenido' | 'perfil', entityId: number) {
    const { data } = await axiosInstance.get(`/images/${entityType}/${entityId}`);
    return data;
  },

  // ── Upload Avatar (Firebase Storage) ───────────────────
  async uploadAvatar(imageSource: string | File): Promise<{ url: string; filename: string }> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No auth user');
    const filename = `avatar_${Date.now()}.jpg`;
    const path = `avatars/${uid}/${filename}`;
    const sref = storageRef(storage, path);
    let dataUrlForFallback: string | null = null;

    if (Platform.OS === 'web') {
      try {
        if (typeof imageSource === 'string') {
          if (imageSource.startsWith('data:')) {
            return { url: imageSource, filename };
          }
          try {
            const blob = await fetch(imageSource).then(r => r.blob());
            const reader = new (globalThis as any).FileReader();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            return { url: dataUrl, filename };
          } catch (_) {
            return { url: imageSource, filename };
          }
        } else {
          const reader = new (globalThis as any).FileReader();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(imageSource as any);
          });
          return { url: dataUrl, filename };
        }
      } catch (_) {
        return { url: typeof imageSource === 'string' ? imageSource : '', filename };
      }
    }

    try {
      if (typeof imageSource === 'string') {
        if (imageSource.startsWith('data:')) {
          const commaIndex = imageSource.indexOf(',');
          const base64 = commaIndex >= 0 ? imageSource.slice(commaIndex + 1) : imageSource;
          dataUrlForFallback = `data:image/jpeg;base64,${base64}`;
          await uploadString(sref, dataUrlForFallback, 'data_url');
        } else {
          try {
            const mod = require('expo-image-manipulator');
            const SaveFormat = mod.SaveFormat || { JPEG: 'jpeg' };
            const result = await mod.manipulateAsync(
              imageSource,
              [{ resize: { width: 256, height: 256 } }],
              { compress: 0.8, format: SaveFormat.JPEG, base64: true }
            );
            if (result?.base64) {
              dataUrlForFallback = `data:image/jpeg;base64,${result.base64}`;
              await uploadString(sref, dataUrlForFallback, 'data_url');
            } else {
              const base64 = await FileSystemLegacy.readAsStringAsync(imageSource, { encoding: 'base64' as any });
              dataUrlForFallback = `data:image/jpeg;base64,${base64}`;
              await uploadString(sref, dataUrlForFallback, 'data_url');
            }
          } catch (_) {
            const base64 = await FileSystemLegacy.readAsStringAsync(imageSource, { encoding: 'base64' as any });
            dataUrlForFallback = `data:image/jpeg;base64,${base64}`;
            await uploadString(sref, dataUrlForFallback, 'data_url');
          }
        }
      } else {
        try {
          await uploadBytes(sref, imageSource as any);
        } catch (_) {
          const toDataUrl = (file: any) => new Promise<string>((resolve, reject) => {
            try {
              const reader = new (globalThis as any).FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            } catch (err) {
              reject(err);
            }
          });
          const dataUrl = await toDataUrl(imageSource as any);
          dataUrlForFallback = dataUrl;
          await uploadString(sref, dataUrl, 'data_url');
        }
      }
      const url = await getDownloadURL(sref);
      return { url, filename };
    } catch (e: any) {
      if (dataUrlForFallback) {
        return { url: dataUrlForFallback, filename };
      }
      throw e;
    }
  }
};

export default databaseService;