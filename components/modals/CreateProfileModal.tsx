import React, { useRef, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CreateProfileModalProps {
  visible: boolean;
  creating: boolean;
  newProfileName: string;
  selectedImageUri: string | null;
  onClose: () => void;
  onConfirm: () => void;
  setNewProfileName: (name: string) => void;
  handleSelectImage: () => void;
  handleWebFileSelect: (event: any) => void;
}

export const CreateProfileModal: React.FC<CreateProfileModalProps> = ({
  visible,
  creating,
  newProfileName,
  selectedImageUri,
  onClose,
  onConfirm,
  setNewProfileName,
  handleSelectImage,
  handleWebFileSelect,
}) => {
  const fileInputRef = useRef<any>(null);
  const [cancelHovered, setCancelHovered] = useState(false);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Top Red Border Accent */}
          <View style={styles.topRedBar} />
          
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>

          <View style={styles.badge}>
            <Text style={styles.badgeText}>NUEVO</Text>
          </View>
          
          <View style={styles.titleRow}>
            <Text style={styles.titleWhite}>Crear</Text>
          </View>
          <View style={styles.titleRow}>
            <Text style={styles.titleRed}>perfil</Text>
          </View>

          <Text style={styles.fieldLabel}>FOTO</Text>
          <TouchableOpacity
            style={styles.imagePickerContainer}
            onPress={() => {
                if (Platform.OS === 'web' && fileInputRef.current) {
                    fileInputRef.current.click();
                } else {
                    handleSelectImage();
                }
            }}
            disabled={creating}
          >
            {selectedImageUri ? (
              <Image source={{ uri: selectedImageUri }} style={styles.previewImage} />
            ) : (
              <View style={styles.imagePickerPlaceholder}>
                <Ionicons name="camera-outline" size={24} color="rgba(255,255,255,0.3)" />
                <Text style={styles.imagePickerText}>Toca para seleccionar imagen</Text>
              </View>
            )}
          </TouchableOpacity>
          {Platform.OS === 'web' && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleWebFileSelect}
            />
          )}

          <Text style={styles.fieldLabel}>NOMBRE DEL PERFIL</Text>
          <TextInput
            style={[styles.nameInput, Platform.OS === 'web' && ({ outline: 'none' } as any)]}
            placeholder="Nombre del perfil"
            placeholderTextColor="rgba(255,255,255,0.2)"
            value={newProfileName}
            onChangeText={setNewProfileName}
            maxLength={20}
          />
          
          <View style={styles.modalButtons}>
            <Pressable
              style={[styles.cancelBtn, cancelHovered && styles.cancelBtnHover]}
              onPress={onClose}
              // @ts-ignore
              onHoverIn={() => setCancelHovered(true)}
              onHoverOut={() => setCancelHovered(false)}
            >
              <Text style={[styles.cancelBtnText, cancelHovered && styles.cancelBtnTextHover]}>CANCELAR</Text>
            </Pressable>
            <TouchableOpacity
              style={[styles.createBtn, creating && styles.buttonDisabled]}
              disabled={creating}
              onPress={onConfirm}
            >
              <Text style={styles.createBtnText}>{creating ? 'CREANDO...' : 'CREAR'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#0a0a0a',
    padding: 32,
    width: '90%',
    maxWidth: 420,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  topRedBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#E50914',
  },
  closeBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 48,
    height: 48,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#E50914',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  titleRow: {
    flexDirection: 'row',
  },
  titleWhite: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 34,
  },
  titleRed: {
    color: '#E50914',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 34,
    marginBottom: 24,
  },
  fieldLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  imagePickerContainer: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
    borderRadius: 0,
    marginBottom: 24,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  imagePickerPlaceholder: {
    alignItems: 'center',
    gap: 8,
  },
  imagePickerText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
  },
  nameInput: {
    backgroundColor: '#111',
    color: '#fff',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    marginBottom: 32,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  cancelBtnHover: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: '#fff',
  },
  cancelBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cancelBtnTextHover: {
    color: '#fff',
  },
  createBtn: {
    flex: 1,
    backgroundColor: '#9e0000',
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
