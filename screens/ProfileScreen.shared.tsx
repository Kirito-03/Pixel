import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Switch, ActivityIndicator, Modal, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useProfileScreenLogic } from '../hooks/useProfileScreenLogic';
import { useTheme } from '../contexts/ThemeContext';
import { useAdmin } from '../contexts/AdminContext';
import { useAppUpdate } from '../contexts/AppUpdateContext';
import { auth } from '../services/firebase';

type Section = 'account' | 'preferences' | 'security';
const sections: { key: Section; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'account', label: 'Cuenta', icon: 'person-outline' },
  { key: 'preferences', label: 'Preferencias', icon: 'options-outline' },
  { key: 'security', label: 'Seguridad', icon: 'shield-checkmark-outline' },
];
function Row({ label, detail, children }: { label: string; detail?: string; children?: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.row, { borderBottomColor: colors.divider }]}>
    <View style={styles.rowCopy}><Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {detail ? <Text style={[styles.detail, { color: colors.textSecondary }]}>{detail}</Text> : null}</View>{children}
  </View>;
}
function Action({ title, onPress, busy = false, primary = false }: { title: string; onPress: () => void; busy?: boolean; primary?: boolean }) {
  const { colors } = useTheme();
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: busy, busy }} disabled={busy}
    onPress={onPress} style={[styles.action, { backgroundColor: primary ? colors.primary : colors.cardLight }]}>
    {busy ? <ActivityIndicator size="small" color={primary ? '#fff' : colors.text} /> : <Text style={[styles.actionText, { color: primary ? '#fff' : colors.text }]}>{title}</Text>}
  </TouchableOpacity>;
}
export default function ProfileScreen() {
  const p = useProfileScreenLogic();
  const { colors, theme, setTheme } = useTheme();
  const { isAdmin } = useAdmin();
  const updates = useAppUpdate();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [section, setSection] = useState<Section>('account');
  const providers = auth.currentUser?.providerData?.map((provider: any) => provider.providerId) || [];
  const password = providers.includes('password');
  const providerLabel = providers.includes('google.com') ? 'Google' : password ? 'Correo y contraseña' : 'Cuenta vinculada';
  const back = () => p.navigation.canGoBack() ? p.navigation.goBack() : (p.navigation as any).navigate('Inicio');
  const heading = section === 'account' ? 'Tu cuenta' : section === 'preferences' ? 'A tu manera' : 'Acceso y seguridad';
  return <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: colors.background }]}>
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={[styles.bound, { paddingHorizontal: width < 600 ? 20 : 32 }]}>
        <View style={styles.topbar}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver" onPress={back} style={styles.back}>
            <Ionicons name="arrow-back" size={20} color={colors.text} /><Text style={[styles.detail, { color: colors.text }]}>Volver</Text>
          </TouchableOpacity>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>MI PERFIL</Text>
        </View>
        <View style={[styles.intro, !wide && styles.introMobile]}>
          <View style={styles.identity}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cambiar foto de perfil" onPress={p.handleChangeAvatar} disabled={p.updatingAvatar}
              style={[styles.avatarBox, { backgroundColor: colors.card }]}>
              {p.updatingAvatar ? <ActivityIndicator color={colors.primary} /> : p.imageError ? <Ionicons name="person-outline" size={32} color={colors.textMuted} /> :
                <Image key={`${p.avatarKey}`} source={{ uri: p.getAvatarUrl() }} style={styles.avatar} onError={() => p.setImageError(true)} />}
              <View style={[styles.camera, { backgroundColor: colors.primary }]}><Ionicons name="camera" size={12} color="#fff" /></View>
            </TouchableOpacity>
            <View style={styles.identityCopy}><Text numberOfLines={2} style={[styles.name, { color: colors.text }]}>{p.currentProfile?.name || 'Mi perfil'}</Text>
              <Text style={[styles.detail, { color: colors.textMuted }]}>{p.user?.email || ''}</Text></View>
          </View>
          <View style={styles.themeArea}>
            <Text style={[styles.themeLabel, { color: colors.textMuted }]}>APARIENCIA</Text>
            <View style={[styles.themePicker, { backgroundColor: colors.card }]}>
              {(['light', 'dark'] as const).map(value => <TouchableOpacity key={value} accessibilityRole="button"
                accessibilityLabel={`Usar modo ${value === 'light' ? 'claro' : 'oscuro'}`} accessibilityState={{ selected: theme === value }}
                onPress={() => setTheme(value)} style={[styles.themeOption, { backgroundColor: theme === value ? colors.surfaceElevated : 'transparent' }]}>
                <Ionicons name={value === 'light' ? 'sunny-outline' : 'moon-outline'} size={18} color={theme === value ? colors.primary : colors.textMuted} />
                <Text style={[styles.actionText, { color: colors.text }]}>{value === 'light' ? 'Claro' : 'Oscuro'}</Text>
                {theme === value && <Ionicons name="checkmark" size={14} color={colors.primary} />}
              </TouchableOpacity>)}
            </View>
          </View>
        </View>
        <View style={[styles.layout, !wide && styles.layoutMobile]}>
          <View style={[styles.nav, wide ? styles.navWide : styles.navMobile]}>
            {sections.map(item => <TouchableOpacity key={item.key} accessibilityRole="button" accessibilityLabel={`Perfil: ${item.label}`}
              accessibilityState={{ selected: section === item.key }} onPress={() => setSection(item.key)}
              style={[styles.navItem, !wide && { paddingHorizontal: 10, gap: 6 }, { backgroundColor: section === item.key ? colors.card : 'transparent' }]}>
              <Ionicons name={item.icon} size={18} color={section === item.key ? colors.primary : colors.textMuted} />
              <Text style={[styles.navLabel, { color: section === item.key ? colors.text : colors.textMuted }]}>{item.label}</Text>
            </TouchableOpacity>)}
            {wide && isAdmin && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Abrir administrador" style={styles.navItem} onPress={p.handleAdminAccess}>
              <Ionicons name="grid-outline" size={18} color={colors.textMuted} /><Text style={[styles.navLabel, { color: colors.textMuted }]}>Administrador</Text>
            </TouchableOpacity>}
          </View>
          <View style={styles.content}>
            <Text style={[styles.heading, { color: colors.text }]}>{heading}</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>{section === 'account' ? 'Tus datos y el perfil que estás usando.' : section === 'preferences' ? 'Elige qué ver y cómo usar Pixel en este dispositivo.' : 'Revisa cómo accedes y protege tu cuenta.'}</Text>
            <View style={[styles.surface, { backgroundColor: colors.card }]}>
              {section === 'account' ? <>
                <Row label="Correo" detail={p.user?.email || 'Sin correo'} />
                <Row label="Inicio de sesión" detail={providerLabel} />
                <Row label="Perfil activo" detail={p.currentProfile?.name || 'Sin perfil'}><Action title="Cambiar perfil" onPress={p.handleChangeProfile} /></Row>
                <Row label="Foto de perfil" detail="JPG o PNG, hasta 5 MB"><Action title="Cambiar foto" onPress={p.handleChangeAvatar} busy={p.updatingAvatar} /></Row>
              </> : section === 'preferences' ? <>
                <Row label="Tema" detail={`Modo ${theme === 'dark' ? 'oscuro' : 'claro'}. Se guarda en este dispositivo.`} />
                <Row label="Contenido para adultos" detail="Habilita la sección +18 en este perfil.">
                  <Switch accessibilityLabel="Mostrar contenido para adultos" value={p.adultContentEnabled} onValueChange={p.setAdultContentEnabled}
                    trackColor={{ false: colors.textGray, true: colors.primary }} thumbColor="#fff" />
                </Row>
                <Row label="Idioma" detail="Español" />
              </> : <>
                <Row label="Correo" detail={auth.currentUser?.emailVerified ? 'Verificado' : 'Pendiente de verificar'}>
                  {!auth.currentUser?.emailVerified && <Action title="Verificar correo" onPress={p.handleEmailVerification} />}
                </Row>
                {password ? <Row label="Contraseña" detail="Recibe un enlace para restablecerla."><Action title="Enviar enlace" onPress={p.handlePasswordReset} /></Row> :
                  <Row label="Acceso con Google" detail="La contraseña y la seguridad de este acceso se gestionan en tu cuenta de Google." />}
                <Row label="Sesión actual" detail="Cierra tu sesión en este dispositivo."><Action title="Cerrar sesión" onPress={() => p.setLogoutVisible(true)} /></Row>
              </>}
            </View>
            {section === 'preferences' && Platform.OS === 'android' && <View style={[styles.surface, { backgroundColor: colors.card }]}>
              <Row label="Versión de la app" detail={`${updates.installedVersion} · compilación ${updates.installedCode}`}>
                <Action title="Buscar actualización" onPress={() => { void updates.check(); }} busy={updates.checking} />
              </Row>
              {updates.available && updates.release ? <View style={styles.release}>
                <Text style={[styles.label, { color: colors.text }]}>Nueva versión {updates.release.version}</Text>
                <Text style={[styles.detail, { color: colors.textSecondary }]}>{updates.release.notes || 'Hay una nueva APK disponible.'}</Text>
                <Text style={[styles.detail, { color: colors.textMuted }]}>La instalación se confirma en Android.</Text>
                <Action title="Descargar APK" onPress={() => { void updates.download(); }} primary />
              </View> : updates.checked && !updates.error ? <Text style={[styles.releaseNotice, { color: colors.textSecondary }]}>{updates.release ? 'Tienes la versión más reciente.' : 'Aún no hay una APK publicada.'}</Text> : null}
              {updates.error ? <Text accessibilityRole="alert" style={[styles.releaseNotice, { color: colors.primary }]}>{updates.error}</Text> : null}
            </View>}
            <View style={styles.footer}>
              {isAdmin && !wide && <Action title="Abrir administrador" onPress={p.handleAdminAccess} />}
              {section !== 'security' && <TouchableOpacity accessibilityRole="button" style={styles.footerAction} onPress={() => p.setLogoutVisible(true)}>
                <Ionicons name="log-out-outline" size={18} color={colors.primary} /><Text style={[styles.actionText, { color: colors.primary }]}>Cerrar sesión</Text>
              </TouchableOpacity>}
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
    {Platform.OS === 'web' && <input ref={el => { p.fileInputRef.current = el; }} type="file" accept="image/jpeg,image/png" style={{ display: 'none' }} onChange={p.handleWebFileSelect} />}
    <Modal visible={p.logoutVisible} transparent animationType="fade" onRequestClose={() => p.setLogoutVisible(false)}>
      <View style={styles.overlay}><View style={[styles.dialog, { backgroundColor: colors.surfaceElevated }]}>
        <Text style={[styles.dialogTitle, { color: colors.text }]}>¿Cerrar sesión?</Text>
        <Text style={[styles.detail, { color: colors.textSecondary }]}>Saldrás de tu cuenta en este dispositivo.</Text>
        <View style={styles.dialogActions}><Action title="Cancelar" onPress={() => p.setLogoutVisible(false)} />
          <Action title="Cerrar sesión" onPress={p.handleLogoutAction} busy={p.logoutLoading} primary /></View>
      </View></View>
    </Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1 }, scroll: { flexGrow: 1, paddingBottom: 48 }, bound: { width: '100%', maxWidth: 1160, alignSelf: 'center' },
  topbar: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  intro: { paddingVertical: 24, paddingBottom: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 24 },
  introMobile: { alignItems: 'flex-start', flexDirection: 'column', paddingBottom: 24 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, flexShrink: 1, minWidth: 0 }, identityCopy: { flexShrink: 1, gap: 6 },
  avatarBox: { width: 72, height: 72, borderRadius: 4, alignItems: 'center', justifyContent: 'center' }, avatar: { width: 72, height: 72, borderRadius: 4 },
  camera: { position: 'absolute', bottom: -4, right: -4, padding: 5, borderRadius: 3 }, name: { fontSize: 26, lineHeight: 32, fontWeight: '800' },
  themeArea: { gap: 8 }, themeLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 }, themePicker: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 4 },
  themeOption: { minHeight: 44, minWidth: 108, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 2 },
  layout: { flexDirection: 'row', gap: 48 }, layoutMobile: { flexDirection: 'column', gap: 24 }, nav: { gap: 4 }, navWide: { width: 210 },
  navMobile: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, navItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 3 },
  navLabel: { fontSize: 13, fontWeight: '600' }, content: { flex: 1, minWidth: 0, maxWidth: 780 }, heading: { fontSize: 30, lineHeight: 38, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 24 }, surface: { marginBottom: 20, borderRadius: 3, paddingHorizontal: 20 },
  row: { minHeight: 84, paddingVertical: 18, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 16, rowGap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 170, gap: 6 }, label: { fontSize: 14, fontWeight: '600', lineHeight: 20 }, detail: { fontSize: 13, lineHeight: 20, flexShrink: 1 },
  action: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', alignItems: 'center', borderRadius: 3 }, actionText: { fontSize: 12, fontWeight: '600' },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 4 }, footerAction: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 4 },
  release: { paddingVertical: 20, gap: 12, alignItems: 'flex-start' }, releaseNotice: { paddingVertical: 18, fontSize: 13, lineHeight: 20 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.65)', justifyContent: 'center', alignItems: 'center', padding: 24 }, dialog: { maxWidth: 400, width: '100%', padding: 24, borderRadius: 4, gap: 16 },
  dialogTitle: { fontSize: 22, fontWeight: '700' }, dialogActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end', marginTop: 8 },
});
