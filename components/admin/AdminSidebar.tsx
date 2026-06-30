import React from 'react'
import { View, Text, Pressable, StyleSheet, useWindowDimensions, Platform, Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ADMIN_NAV_ITEMS, type AdminNavItem } from './AdminNav'
import { adminColors } from '../../theme'

type Props = {
  activeKey: string
  onSelect: (item: AdminNavItem) => void
}

export function AdminSidebar({ activeKey, onSelect }: Props) {
  const { width } = useWindowDimensions()
  const isWide = width >= 980 && Platform.OS === 'web'
  if (!isWide) return null

  const pulse = React.useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  return (
    <View style={styles.wrap}>
      <View style={styles.brand}>
        <Animated.View
          style={[
            styles.brandDot,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
              ],
            },
          ]}
        />
        <Text style={styles.brandText}>Admin</Text>
      </View>

      <View style={styles.menu}>
        {ADMIN_NAV_ITEMS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => !item.disabled && item.route && onSelect(item)}
            style={(state: any) => [
              styles.item,
              item.key === activeKey && styles.itemActive,
              item.disabled && styles.itemDisabled,
              state.hovered && !item.disabled && styles.itemHover,
              state.pressed && !item.disabled && styles.itemPressed,
            ]}
          >
            <Ionicons
              name={item.icon as any}
              size={18}
              color={
                item.key === activeKey
                  ? adminColors.primary
                  : item.disabled
                    ? 'rgba(255, 255, 255, 0.35)'
                    : adminColors.sidebarTextMuted
              }
            />
            <Text
              style={[
                styles.itemText,
                item.key === activeKey && styles.itemTextActive,
                item.disabled && styles.itemTextDisabled,
              ]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: 260,
    backgroundColor: adminColors.sidebarBg,
    borderRightWidth: 1,
    borderRightColor: adminColors.sidebarBorder,
    paddingTop: 14,
    paddingHorizontal: 12,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: adminColors.sidebarBorder,
  },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: adminColors.primary,
  },
  brandText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  menu: {
    paddingTop: 12,
    gap: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  itemHover: {
    backgroundColor: adminColors.sidebarHover,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  itemPressed: {
    opacity: 0.9,
  },
  itemActive: {
    backgroundColor: adminColors.sidebarHover,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  itemDisabled: {
    opacity: 0.55,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
    color: adminColors.sidebarText,
    fontSize: 13,
    fontWeight: '700',
  },
  itemTextActive: {
    color: '#FFFFFF',
  },
  itemTextDisabled: {
    color: 'rgba(255, 255, 255, 0.35)',
  },
})

