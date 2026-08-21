import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform } from 'react-native';
import { Storage } from '../services/storage';
import { useTheme } from '../contexts/ThemeContext';

export default function ConsentModal() {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const checkConsent = async () => {
      try {
        const hasConsented = Storage.getString('cookie_consent');
        if (!hasConsented) {
          setVisible(true);
        }
      } catch (e) {
        console.error('Error checking consent', e);
      }
    };
    checkConsent();
  }, []);

  const handleAccept = () => {
    try {
      Storage.setString('cookie_consent', 'accepted');
      setVisible(false);
    } catch (e) {
      console.error('Error saving consent', e);
    }
  };

  const handleDecline = () => {
    try {
      Storage.setString('cookie_consent', 'declined');
      setVisible(false);
    } catch (e) {
      console.error('Error saving consent', e);
    }
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="slide" visible={visible}>
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.text }]}>Valoramos tu Privacidad</Text>
          <Text style={[styles.description, { color: colors.text, opacity: 0.8 }]}>
            Usamos tecnologías como cookies (identificadores de dispositivo) para personalizar tu experiencia, 
            analizar nuestro tráfico y mantener las sesiones. Puedes aceptar o rechazar el rastreo analítico.
          </Text>
          
          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={[styles.button, styles.declineButton]} 
              onPress={handleDecline}
            >
              <Text style={styles.declineText}>Rechazar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, styles.acceptButton]} 
              onPress={handleAccept}
            >
              <Text style={styles.acceptText}>Aceptar Todo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end', // Al bottom
  },
  modalContainer: {
    padding: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  declineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666',
  },
  acceptButton: {
    backgroundColor: '#E50914',
  },
  declineText: {
    color: '#ccc',
    fontWeight: '600',
  },
  acceptText: {
    color: '#fff',
    fontWeight: '600',
  },
});
