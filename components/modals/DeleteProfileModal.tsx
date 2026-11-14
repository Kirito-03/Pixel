import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface DeleteProfileModalProps {
  visible: boolean;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteProfileModal: React.FC<DeleteProfileModalProps> = ({
  visible,
  deleting,
  onClose,
  onConfirm,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Eliminar perfil</Text>
          <Text style={styles.subtitle}>¿Seguro que quieres eliminar este perfil?</Text>
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createButton, deleting && styles.buttonDisabled]}
              disabled={deleting}
              onPress={onConfirm}
            >
              <Text style={styles.createButtonText}>{deleting ? 'Eliminando...' : 'Eliminar'}</Text>
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
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#1f1f1f',
        borderRadius: 12,
        padding: 20,
        width: '90%',
        maxWidth: 400,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#aaa',
        marginBottom: 20,
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
    },
    cancelButton: {
        padding: 10,
    },
    cancelButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    createButton: {
        backgroundColor: '#e50914',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 6,
    },
    createButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
});
