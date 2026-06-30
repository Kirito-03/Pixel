import React from 'react'
import { View, StyleSheet, useWindowDimensions, Platform, Animated } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { AdminSidebar } from './AdminSidebar'
import type { AdminNavItem } from './AdminNav'
import { adminColors } from '../../theme'

type Props = {
  activeKey: string
  children: React.ReactNode
}

export function AdminShell({ activeKey, children }: Props) {
  const navigation = useNavigation()
  const { width } = useWindowDimensions()
  const isWide = width >= 980 && Platform.OS === 'web'
  const enter = React.useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    enter.setValue(0)
    Animated.timing(enter, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [activeKey, enter])

  const handleSelect = (item: AdminNavItem) => {
    if (!item.route) return
    ;(navigation as any).navigate(item.route)
  }

  return (
    <View style={styles.page}>
      {isWide && <AdminSidebar activeKey={activeKey} onSelect={handleSelect} />}
      <Animated.View
        style={[
          styles.content,
          {
            opacity: enter,
            transform: [
              {
                translateY: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [6, 0],
                }),
              },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: adminColors.background,
  },
  content: {
    flex: 1,
    minWidth: 0,
    backgroundColor: adminColors.background,
  },
})

