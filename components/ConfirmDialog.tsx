import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  errorText?: string | null;
  iconName?: React.ComponentProps<typeof Ionicons>['name'] | null;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
};

export default function ConfirmDialog({
  visible,
  title,
  message,
  errorText = null,
  iconName = 'trash-outline',
  confirmText = 'Eliminar',
  cancelText = 'Cancelar',
  destructive = true,
  onCancel,
  onConfirm,
}: Props) {
  const [mounted, setMounted] = useState(visible);
  const [loading, setLoading] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: visible ? 180 : 140, useNativeDriver: true }),
      Animated.timing(scale, { toValue: visible ? 1 : 0.96, duration: visible ? 220 : 160, useNativeDriver: true }),
    ]).start(() => {
      if (!visible) setMounted(false);
    });
  }, [mounted, opacity, scale, visible]);

  const confirmColor = useMemo(() => (destructive ? '#E50914' : '#2ECC71'), [destructive]);

  const handleCancel = () => {
    if (loading) return;
    onCancel();
  };

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={handleCancel}>
      <Pressable style={styles.backdrop} onPress={handleCancel}>
        <Animated.View style={[styles.backdropFill, { opacity }]} />
      </Pressable>

      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View style={[styles.cardWrap, { opacity, transform: [{ scale }] }]} pointerEvents="auto">
          <LinearGradient colors={['#171717', '#101010']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
            {iconName ? (
              <View style={styles.iconRow}>
                <View style={[styles.iconBadge, destructive ? styles.iconBadgeDanger : styles.iconBadgeNeutral]}>
                  <Ionicons name={iconName} size={16} color={destructive ? '#FF5A5F' : 'rgba(255,255,255,0.9)'} />
                </View>
              </View>
            ) : null}
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.message}>{message}</Text>
            {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

            <View style={styles.row}>
              <Pressable onPress={handleCancel} style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]} disabled={loading}>
                <Text style={styles.btnGhostText}>{cancelText}</Text>
              </Pressable>

              <Pressable
                onPress={handleConfirm}
                style={({ pressed }) => [styles.btn, { backgroundColor: confirmColor }, pressed && styles.pressed, loading && styles.btnDisabled]}
                disabled={loading}
              >
                <Text style={styles.btnText}>{loading ? 'Eliminando...' : confirmText}</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  cardWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  card: {
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  iconRow: {
    marginBottom: 10,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconBadgeDanger: {
    backgroundColor: 'rgba(229,9,20,0.10)',
    borderColor: 'rgba(229,9,20,0.25)',
  },
  iconBadgeNeutral: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  message: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 20,
  },
  errorText: {
    color: '#FF5A5F',
    fontSize: 12,
    lineHeight: 16,
    marginTop: -8,
    marginBottom: 14,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.85,
  },
  btnGhost: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  btnGhostText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
});
