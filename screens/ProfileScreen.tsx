import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Switch,
  ActivityIndicator,
  Platform,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { auth } from '../services/firebase';
import { useProfileScreenLogic } from '../hooks/useProfileScreenLogic';
import { useAdmin } from '../contexts/AdminContext';

// ── Tipos de sección del sidebar ──────────────────────────────
type SectionKey = 'cuenta' | 'seguridad' | 'configuracion' | 'apariencia' | 'admin';

interface SidebarItem {
  key: SectionKey;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'cuenta',        label: 'Cuenta',        icon: 'person-outline' },
  { key: 'seguridad',     label: 'Seguridad',     icon: 'shield-outline' },
  { key: 'configuracion', label: 'Configuración', icon: 'settings-outline' },
  { key: 'apariencia',    label: 'Apariencia',    icon: 'color-palette-outline' },
  { key: 'admin',         label: 'Administrador', icon: 'construct-outline', adminOnly: true },
];

// ── Card wrapper ───────────────────────────────────────────────
function ProfileCard({ children }: { children: React.ReactNode }) {
  return <View style={cardStyles.card}>{children}</View>;
}
function CardRow({
  label, value, action, actionLabel, danger,
}: {
  label: string; value?: string; action?: () => void; actionLabel?: string; danger?: boolean;
}) {
  return (
    <View style={cardStyles.row}>
      <View style={cardStyles.rowLeft}>
        <Text style={cardStyles.rowLabel}>{label}</Text>
        {value ? <Text style={cardStyles.rowValue}>{value}</Text> : null}
      </View>
      {action && actionLabel ? (
        <TouchableOpacity style={[cardStyles.actionBtn, danger && cardStyles.actionBtnDanger]} onPress={action}>
          <Text style={[cardStyles.actionBtnText, danger && cardStyles.actionBtnTextDanger]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
function CardToggleRow({ label, subtitle, value, onChange }: { label: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={cardStyles.row}>
      <View style={cardStyles.rowLeft}>
        <Text style={cardStyles.rowLabel}>{label}</Text>
        {subtitle ? <Text style={cardStyles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#E50914' }}
        thumbColor={value ? '#fff' : 'rgba(255,255,255,0.5)'}
      />
    </View>
  );
}
function SectionTitle({ children }: { children: string }) {
  return <Text style={cardStyles.sectionTitle}>{children}</Text>;
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  rowLeft: { flex: 1, marginRight: 12 },
  rowLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  rowValue: { color: 'rgba(255,255,255,0.45)', fontSize: 13 },
  rowSubtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 1 },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  actionBtnDanger: { backgroundColor: 'rgba(229,9,20,0.12)', borderColor: 'rgba(229,9,20,0.3)' },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  actionBtnTextDanger: { color: '#E50914' },
  sectionTitle: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 4,
    paddingHorizontal: 2,
  },
});

// ─────────────────────────────────────────────────────────────
// PROFILE SCREEN
// ─────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const props = useProfileScreenLogic();
  const { isAdmin } = useAdmin();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const navigation = useNavigation<any>();

  const [activeSection, setActiveSection] = useState<SectionKey>('cuenta');

  const {
    colors,
    theme,
    notificationsEnabled, setNotificationsEnabled,
    updatingAvatar,
    avatarKey,
    imageError, setImageError,
    currentProfile,
    user,
    adultContentEnabled, setAdultContentEnabled,
    accountModalVisible, setAccountModalVisible,
    logoutVisible, setLogoutVisible,
    logoutLoading,
    getAvatarUrl,
    handleChangeAvatar,
    handleChangeProfile,
    handleAdminLongPress,
    handlePasswordReset,
    handleEmailVerification,
    handleLogoutAction,
  } = props;

  const providerLabel = (() => {
    const providers = auth.currentUser?.providerData?.map((p: any) => p.providerId) || [];
    if (providers.includes('google.com')) return 'Google';
    if (providers.includes('password')) return 'Email y contraseña';
    return providers[0] || '—';
  })();
  const isEmailProvider = auth.currentUser?.providerData?.some((p: any) => p.providerId === 'password');
  const isEmailVerified = !!auth.currentUser?.emailVerified;

  // ── Contenido de cada sección ────────────────────────────
  const renderContent = () => {
    switch (activeSection) {
      case 'cuenta':
        return (
          <>
            <SectionTitle>Perfil</SectionTitle>
            <ProfileCard>
              <CardRow label="Nombre" value={currentProfile?.name || '—'} />
              <CardRow label="Email" value={user?.email || '—'} />
              <CardRow label="Proveedor" value={providerLabel} />
              <CardRow
                label="Contenido +18 (Ecchi/Hentai y adultos)"
                value={adultContentEnabled ? 'Activado' : 'Desactivado'}
                action={() => setAdultContentEnabled(!adultContentEnabled)}
                actionLabel={adultContentEnabled ? 'Desactivar' : 'Activar'}
              />
            </ProfileCard>

            <SectionTitle>Perfil activo</SectionTitle>
            <ProfileCard>
              <CardRow
                label="Cambiar de perfil"
                value="Selecciona o crea un nuevo perfil"
                action={handleChangeProfile}
                actionLabel="Cambiar"
              />
              <CardRow
                label="Informacion de cuenta"
                value="Ver detalles completos"
                action={() => setAccountModalVisible(true)}
                actionLabel="Ver"
              />
            </ProfileCard>
          </>
        );

      case 'seguridad':
        return (
          <>
            <SectionTitle>Contraseña y acceso</SectionTitle>
            <ProfileCard>
              <CardRow label="Estado del email" value={isEmailVerified ? '✓ Verificado' : '✗ Sin verificar'} />
              <CardRow label="Contraseña" value="••••••••••" />
              {isEmailProvider && (
                <CardRow label="Restablecer contraseña" value="Te enviaremos un enlace por email" action={handlePasswordReset} actionLabel="Enviar" />
              )}
              {!isEmailVerified && (
                <CardRow label="Verificar email" value="Confirma tu dirección de correo" action={handleEmailVerification} actionLabel="Enviar" />
              )}
            </ProfileCard>

            <SectionTitle>Sesión</SectionTitle>
            <ProfileCard>
              <CardRow
                label="Cerrar sesión"
                value="Salir de tu cuenta en este dispositivo"
                action={() => setLogoutVisible(true)}
                actionLabel="Cerrar sesión"
                danger
              />
            </ProfileCard>
          </>
        );

      case 'configuracion':
        return (
          <>
            <SectionTitle>Notificaciones</SectionTitle>
            <ProfileCard>
              <CardToggleRow
                label="Notificaciones"
                subtitle="Recibe alertas de nuevos episodios"
                value={notificationsEnabled}
                onChange={setNotificationsEnabled}
              />
            </ProfileCard>

            <SectionTitle>Descargas</SectionTitle>
            <ProfileCard>
              <CardRow
                label="Gestionar descargas"
                value="Ver y eliminar episodios descargados"
                action={() => navigation.navigate('Descargas' as never)}
                actionLabel="Abrir"
              />
            </ProfileCard>

            <SectionTitle>Contenido</SectionTitle>
            <ProfileCard>
              <CardToggleRow
                label="Contenido +18"
                subtitle="Ecchi/Hentai y adultos"
                value={adultContentEnabled}
                onChange={setAdultContentEnabled}
              />
            </ProfileCard>
          </>
        );

      case 'apariencia':
        return (
          <>
            <SectionTitle>Tema</SectionTitle>
            <ProfileCard>
              <CardRow
                label="Tema de la aplicación"
                value={theme === 'dark' ? 'Oscuro' : 'Claro'}
                action={() => navigation.navigate('Apariencia' as never)}
                actionLabel="Cambiar"
              />
            </ProfileCard>
          </>
        );

      case 'admin':
        return (
          <>
            <SectionTitle>Panel de control</SectionTitle>
            <ProfileCard>
              <CardRow
                label="Administrador"
                value="Acceder al panel de gestión"
                action={handleAdminLongPress}
                actionLabel="Abrir"
              />
            </ProfileCard>
          </>
        );
    }
  };

  // ── Sidebar ───────────────────────────────────────────────
  const SidebarContent = () => (
    <View style={[sidebarStyles.sidebar, !isWide && sidebarStyles.sidebarMobile]}>
      {/* Avatar */}
      <TouchableOpacity
        style={sidebarStyles.avatarBox}
        onPress={handleChangeAvatar}
        onLongPress={handleAdminLongPress}
        delayLongPress={800}
        activeOpacity={0.85}
        disabled={updatingAvatar}
      >
        <View style={sidebarStyles.avatarContainer}>
          {updatingAvatar ? (
            <ActivityIndicator size="large" color="#E50914" />
          ) : !imageError ? (
            <Image
              key={`${currentProfile?.avatar_url || 'default'}-${avatarKey}`}
              source={{ uri: getAvatarUrl() }}
              style={sidebarStyles.avatar}
              onError={() => setImageError(true)}
            />
          ) : (
            <Ionicons name="person" size={40} color="rgba(255,255,255,0.3)" />
          )}
        </View>
        <View style={sidebarStyles.avatarEditBadge}>
          <Ionicons name="camera" size={12} color="#fff" />
        </View>
      </TouchableOpacity>

      <Text style={sidebarStyles.name} numberOfLines={1}>{currentProfile?.name || 'Usuario'}</Text>
      <Text style={sidebarStyles.email} numberOfLines={1}>{user?.email || ''}</Text>

      {/* Divider */}
      <View style={sidebarStyles.divider} />

      {/* Nav items */}
      <View style={sidebarStyles.nav}>
        {SIDEBAR_ITEMS.filter(item => !item.adminOnly || isAdmin).map(item => {
          const isActive = activeSection === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[sidebarStyles.navItem, isActive && sidebarStyles.navItemActive]}
              onPress={() => setActiveSection(item.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={item.icon as any}
                size={18}
                color={isActive ? '#E50914' : 'rgba(255,255,255,0.45)'}
              />
              <Text style={[sidebarStyles.navLabel, isActive && sidebarStyles.navLabelActive]}>
                {item.label}
              </Text>
              {isActive && <View style={sidebarStyles.navActiveDot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Spacer */}
      <View style={{ flex: 1 }} />

      {/* Logout */}
      <TouchableOpacity style={sidebarStyles.logoutBtn} onPress={() => setLogoutVisible(true)} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={18} color="rgba(229,9,20,0.8)" />
        <Text style={sidebarStyles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );

  // ── MODALES — sin cambios ──────────────────────────────────
  const Modals = () => (
    <>
      {/* Modal: Información de cuenta */}
      <Modal visible={accountModalVisible} transparent animationType="slide" onRequestClose={() => setAccountModalVisible(false)}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.content}>
            <Text style={modalStyles.title}>Información de la cuenta</Text>
            {[
              ['Email', user?.email || '—'],
              ['Proveedor', providerLabel],
              ['Email verificado', auth.currentUser?.emailVerified ? 'Sí' : 'No'],
              ['Creación', auth.currentUser?.metadata?.creationTime || '—'],
              ['Último acceso', auth.currentUser?.metadata?.lastSignInTime || '—'],
            ].map(([label, value]) => (
              <View key={label} style={modalStyles.row}>
                <Text style={modalStyles.label}>{label}</Text>
                <Text style={modalStyles.value}>{value}</Text>
              </View>
            ))}
            {isEmailProvider && (
              <TouchableOpacity style={modalStyles.btnPrimary} onPress={handlePasswordReset}>
                <Text style={modalStyles.btnPrimaryText}>Restablecer contraseña</Text>
              </TouchableOpacity>
            )}
            {!isEmailVerified && (
              <TouchableOpacity style={modalStyles.btnSecondary} onPress={handleEmailVerification}>
                <Text style={modalStyles.btnSecondaryText}>Enviar verificación de email</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={modalStyles.btnClose} onPress={() => setAccountModalVisible(false)}>
              <Text style={modalStyles.btnCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: Cerrar sesión */}
      <Modal visible={logoutVisible} transparent animationType="fade" onRequestClose={() => setLogoutVisible(false)}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.content}>
            <Text style={modalStyles.title}>Cerrar sesión</Text>
            <Text style={modalStyles.subtitle}>¿Estás seguro de que quieres cerrar sesión?</Text>
            <View style={modalStyles.row2}>
              <TouchableOpacity style={[modalStyles.btnSecondary, { marginTop: 0 }]} onPress={() => setLogoutVisible(false)}>
                <Text style={modalStyles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.btnDanger, logoutLoading && { opacity: 0.6 }]}
                onPress={handleLogoutAction}
                disabled={logoutLoading}
              >
                {logoutLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={modalStyles.btnDangerText}>Cerrar sesión</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );

  // ── Top bar con botón Volver ─────────────────────────────
  const TopBar = () => (
    <View style={topBarStyles.bar}>
      <TouchableOpacity
        style={topBarStyles.backBtn}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.8)" />
        <Text style={topBarStyles.backText}>Volver</Text>
      </TouchableOpacity>
      <Text style={topBarStyles.title}>Mi perfil</Text>
      <View style={topBarStyles.backBtn} />{/* balance simétrico */}
    </View>
  );

  // ── LAYOUT ────────────────────────────────────────────────
  if (isWide) {
    // Web: sidebar izquierda + contenido derecha
    return (
      <SafeAreaView style={pageStyles.container}>
        <TopBar />
        <View style={pageStyles.layout}>
          <SidebarContent />
          <ScrollView style={pageStyles.main} contentContainerStyle={pageStyles.mainContent} showsVerticalScrollIndicator={false}>
            <Text style={pageStyles.sectionHeading}>
              {SIDEBAR_ITEMS.find(i => i.key === activeSection)?.label}
            </Text>
            {renderContent()}
          </ScrollView>
        </View>
        <Modals />
      </SafeAreaView>
    );
  }

  // Mobile: sidebar colapsada arriba + contenido abajo
  return (
    <SafeAreaView style={pageStyles.container}>
      <TopBar />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Avatar + nombre */}
        <View style={sidebarStyles.avatarBox}>
          <TouchableOpacity
            style={sidebarStyles.avatarContainer}
            onPress={handleChangeAvatar}
            onLongPress={handleAdminLongPress}
            delayLongPress={800}
            disabled={updatingAvatar}
            activeOpacity={0.85}
          >
            {updatingAvatar ? <ActivityIndicator size="large" color="#E50914" />
              : !imageError
                ? <Image key={`${currentProfile?.avatar_url || 'default'}-${avatarKey}`} source={{ uri: getAvatarUrl() }} style={sidebarStyles.avatar} onError={() => setImageError(true)} />
                : <Ionicons name="person" size={40} color="rgba(255,255,255,0.3)" />}
          </TouchableOpacity>
          <Text style={[sidebarStyles.name, { marginTop: 8 }]}>{currentProfile?.name || 'Usuario'}</Text>
          <Text style={sidebarStyles.email}>{user?.email || ''}</Text>
        </View>

        {/* Nav horizontal */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={mobileStyles.navRow}>
          {SIDEBAR_ITEMS.filter(item => !item.adminOnly || isAdmin).map(item => {
            const isActive = activeSection === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[mobileStyles.chip, isActive && mobileStyles.chipActive]}
                onPress={() => setActiveSection(item.key)}
              >
                <Ionicons name={item.icon as any} size={14} color={isActive ? '#fff' : 'rgba(255,255,255,0.5)'} />
                <Text style={[mobileStyles.chipText, isActive && mobileStyles.chipTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Contenido */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <Text style={pageStyles.sectionHeading}>{SIDEBAR_ITEMS.find(i => i.key === activeSection)?.label}</Text>
          {renderContent()}
        </View>

        {/* Logout mobile */}
        <TouchableOpacity style={mobileStyles.logoutBtn} onPress={() => setLogoutVisible(true)}>
          <Ionicons name="log-out-outline" size={18} color="rgba(229,9,20,0.8)" />
          <Text style={mobileStyles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
      <Modals />
    </SafeAreaView>
  );
}

// ── STYLES ────────────────────────────────────────────────────
const pageStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  layout: { flex: 1, flexDirection: 'row' },
  main: { flex: 1 },
  mainContent: { padding: 32, paddingTop: 28 },
  sectionHeading: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginBottom: 20,
  },
});

const sidebarStyles = StyleSheet.create({
  sidebar: {
    width: 240,
    backgroundColor: '#111111',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.07)',
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  sidebarMobile: { width: '100%', paddingVertical: 24 },
  avatarBox: { alignItems: 'center', marginBottom: 4 },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(229,9,20,0.4)',
    position: 'relative',
  },
  avatar: { width: '100%', height: '100%' },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#E50914',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  email: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2, textAlign: 'center' },
  divider: { width: '100%', height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 20 },
  nav: { width: '100%', gap: 2 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    position: 'relative',
  },
  navItemActive: { backgroundColor: 'rgba(229,9,20,0.1)' },
  navLabel: { flex: 1, color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '500' },
  navLabelActive: { color: '#FFFFFF', fontWeight: '700' },
  navActiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E50914',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.2)',
    width: '100%',
    marginTop: 16,
  },
  logoutText: { color: 'rgba(229,9,20,0.8)', fontSize: 13, fontWeight: '600' },
});

const mobileStyles = StyleSheet.create({
  navRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipActive: { backgroundColor: '#E50914', borderColor: '#E50914' },
  chipText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.25)',
  },
  logoutText: { color: 'rgba(229,9,20,0.8)', fontSize: 14, fontWeight: '600' },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  content: { backgroundColor: '#161616', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 16, letterSpacing: -0.2 },
  subtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 20, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)' },
  row2: { flexDirection: 'row', gap: 12, marginTop: 20 },
  label: { color: 'rgba(255,255,255,0.45)', fontSize: 13 },
  value: { color: '#fff', fontSize: 13, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  btnPrimary: { backgroundColor: '#E50914', borderRadius: 8, padding: 13, alignItems: 'center', marginTop: 14 },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnSecondary: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: 13, alignItems: 'center', marginTop: 10 },
  btnSecondaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnDanger: { flex: 1, backgroundColor: '#E50914', borderRadius: 8, padding: 13, alignItems: 'center' },
  btnDangerText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnClose: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 8, padding: 13, alignItems: 'center', marginTop: 10 },
  btnCloseText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
});

const topBarStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0A0A0A',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 80,
    paddingVertical: 4,
  },
  backText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '500',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
