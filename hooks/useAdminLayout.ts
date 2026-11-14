import { Platform, useWindowDimensions } from 'react-native';
/** Match AdminShell's 232px sidebar before choosing the form layout. */
export function useAdminLayout() {
  const { width } = useWindowDimensions();
  const contentWidth = width - (Platform.OS === 'web' && width >= 980 ? 232 : 0);
  return { width: contentWidth, isWide: contentWidth >= 900, isCompact: contentWidth < 480 };
}
