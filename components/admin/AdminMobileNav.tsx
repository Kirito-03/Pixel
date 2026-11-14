import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { ADMIN_NAV_ITEMS, type AdminNavItem } from './AdminNav'
import { adminColors } from '../../theme'

type Props = {
  activeKey: string
  onSelect: (item: AdminNavItem) => void
}

/**
 * Barra de navegación inferior visible en móvil (nativo y web estrecho) para cambiar entre módulos admin.
 */
export function AdminMobileNav({ activeKey, onSelect }: Props) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {ADMIN_NAV_ITEMS.map((item) => {
        const isActive = item.key === activeKey || (activeKey === 'episodes' && item.key === 'anime')
        return (
          <Pressable
            key={item.key}
            onPress={() => onSelect(item)}
            accessibilityRole="tab"
            accessibilityLabel={item.shortLabel || item.label}
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => [
              styles.item,
              isActive && styles.itemActive,
              pressed && styles.itemPressed,
            ]}
          >
            <Ionicons
              name={item.icon as any}
              size={20}
              color={isActive ? adminColors.primary : adminColors.textSecondary}
            />
            <Text
              style={[styles.label, isActive && styles.labelActive]}
              numberOfLines={1}
            >
              {item.shortLabel || item.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: adminColors.surface,
    borderTopWidth: 1,
    borderTopColor: adminColors.border,
    paddingTop: 4,
    paddingHorizontal: 4,
  },
  item: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 2,
    paddingVertical: 4,
    borderRadius: 8,
  },
  itemActive: {
    backgroundColor: 'rgba(117, 2, 15, 0.06)',
  },
  itemPressed: {
    opacity: 0.75,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: adminColors.textSecondary,
    textAlign: 'center',
  },
  labelActive: {
    color: adminColors.primary,
    fontWeight: '800',
  },
})
