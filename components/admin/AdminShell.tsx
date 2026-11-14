import React from 'react'
import { View, StyleSheet, useWindowDimensions, Platform, Animated } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { AdminSidebar } from './AdminSidebar'
import { AdminMobileNav } from './AdminMobileNav'
import type { AdminNavItem } from './AdminNav'
import { adminColors } from '../../theme'

type Props = {
  activeKey: string
  children: React.ReactNode
}

/**
 * Contenedor principal del módulo administrador: sidebar en web ancho y navegación inferior visible en móvil.
 */
export function AdminShell({ activeKey, children }: Props) {
  const navigation = useNavigation()
  const { width } = useWindowDimensions()
  const isWide = width >= 980 && Platform.OS === 'web'
  const enter = React.useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    enter.setValue(0)
    Animated.timing(enter, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start()
  }, [activeKey, enter])

  const handleSelect = (item: AdminNavItem) => {
    if (!item.route) return
    if (item.params) {
      ;(navigation as any).navigate(item.route, item.params)
    } else {
      ;(navigation as any).navigate(item.route)
    }
  }

  const handleExit = () => {
    ;(navigation as any).getParent()?.goBack()
  }

  return (
    <View style={[styles.page, isWide ? styles.pageRow : styles.pageCol]}>
      {isWide && <AdminSidebar activeKey={activeKey} onSelect={handleSelect} onExit={handleExit} />}
      <Animated.View
        style={[
          styles.content,
          {
            opacity: enter,
            transform: [
              {
                translateY: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [4, 0],
                }),
              },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
      {!isWide && <AdminMobileNav activeKey={activeKey} onSelect={handleSelect} />}
    </View>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: adminColors.background,
  },
  pageRow: {
    flexDirection: 'row',
  },
  pageCol: {
    flexDirection: 'column',
  },
  content: {
    flex: 1,
    minWidth: 0,
    backgroundColor: adminColors.background,
  },
})
