import React from 'react'
import { View, Text, Pressable, StyleSheet, useWindowDimensions, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ADMIN_NAV_ITEMS, type AdminNavItem } from './AdminNav'
import { adminColors } from '../../theme'

type Props = {
  activeKey: string
  onSelect: (item: AdminNavItem) => void
  onExit?: () => void
}

/**
 * Sidebar de navegación para el módulo administrador en pantallas anchas web.
 */
export function AdminSidebar({ activeKey, onSelect, onExit }: Props) {
  const { width } = useWindowDimensions()
  const isWide = width >= 980 && Platform.OS === 'web'
  if (!isWide) return null

  return (
    <View style={styles.wrap}>
      <View style={styles.brand}>
        <View style={styles.brandDot} />
        <View style={styles.brandTextWrap}>
          <Text style={styles.brandText}>Pixel Admin</Text>
          <Text style={styles.brandSub}>Panel de gestión</Text>
        </View>
      </View>

      <View style={styles.menu}>
        {ADMIN_NAV_ITEMS.map((item) => {
          const isActive = item.key === activeKey || (activeKey === 'episodes' && item.key === 'anime')
          return (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isActive }}
              style={(state: any) => [
                styles.item,
                isActive && styles.itemActive,
                state.hovered && !isActive && styles.itemHover,
                state.pressed && styles.itemPressed,
              ]}
            >
              <Ionicons
                name={item.icon as any}
                size={18}
                color={isActive ? '#FFFFFF' : adminColors.sidebarTextMuted}
              />
              <Text
                style={[styles.itemText, isActive && styles.itemTextActive]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {onExit && (
        <View style={styles.footer}>
          <Pressable
            onPress={onExit}
            accessibilityRole="button"
            style={(state: any) => [
              styles.exitBtn,
              state.hovered && styles.itemHover,
              state.pressed && styles.itemPressed,
            ]}
          >
            <Ionicons name="exit-outline" size={18} color={adminColors.sidebarTextMuted} />
            <Text style={styles.exitText} numberOfLines={1}>Volver a Pixel</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: 232,
    flexShrink: 0,
    backgroundColor: adminColors.sidebarBg,
    borderRightWidth: 1,
    borderRightColor: adminColors.sidebarBorder,
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 12,
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: adminColors.sidebarBorder,
  },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: adminColors.primary,
  },
  brandTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  brandText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  brandSub: {
    fontSize: 11,
    color: adminColors.sidebarTextMuted,
    marginTop: 1,
  },
  menu: {
    flex: 1,
    paddingTop: 14,
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 4,
  },
  itemHover: {
    backgroundColor: adminColors.sidebarHover,
  },
  itemPressed: {
    opacity: 0.88,
  },
  itemActive: {
    backgroundColor: adminColors.primary,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
    color: adminColors.sidebarText,
    fontSize: 13,
    fontWeight: '600',
  },
  itemTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  footer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: adminColors.sidebarBorder,
  },
  exitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  exitText: {
    color: adminColors.sidebarTextMuted,
    fontSize: 13,
    fontWeight: '600',
  },
})
