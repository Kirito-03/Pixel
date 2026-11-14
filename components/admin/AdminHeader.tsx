import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { adminColors } from '../../theme'

type Props = {
  title: string
  subtitle?: string
  onBack?: () => void
  rightSlot?: React.ReactNode
}

/**
 * Encabezado común para las pantallas del panel administrador, con soporte responsive en 390 px y objetivos táctiles >= 44 px.
 */
export function AdminHeader({ title, subtitle, onBack, rightSlot }: Props) {
  const { width } = useWindowDimensions()
  const isCompact = width < 480

  return (
    <View style={styles.wrap}>
      <View style={[styles.inner, isCompact && styles.innerCompact]}>
        <View style={styles.left}>
          {onBack && (Platform.OS !== 'web' || width < 980) && (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Volver"
            >
              <Ionicons name="arrow-back" size={20} color={adminColors.text} />
            </TouchableOpacity>
          )}
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
        </View>
        {rightSlot ? <View style={styles.right}>{rightSlot}</View> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: adminColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: adminColors.border,
  },
  inner: {
    width: '100%',
    maxWidth: 1160,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 60,
  },
  innerCompact: {
    paddingHorizontal: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 180,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminColors.background,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: adminColors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: adminColors.textSecondary,
    marginTop: 2,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
})
