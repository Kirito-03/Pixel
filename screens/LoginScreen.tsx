import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  ActivityIndicator,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AntDesign } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import {
  loginEmail,
  requestPasswordReset,
  loginGoogle as loginGoogleProxy,
  getUserDetails,
  signInWithGoogleAndroid,
} from '../services/auth';
import * as GoogleAuth from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../services/firebase';
import AnimatedLeftPanel from '../components/AnimatedLeftPanel';

export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [forgotVisible, setForgotVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [googleHovered, setGoogleHovered] = useState(false);

  const [, , googlePromptAsync] = GoogleAuth.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    androidClientId:
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID_RELEASE ||
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
  });

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Por favor ingresa tu email y contraseña');
      return;
    }
    setEmailLoading(true);
    try {
      const cred = await loginEmail(email.trim().toLowerCase(), password);
      const userDetails = await getUserDetails();
      await login({ uid: cred.user.uid, email: cred.user.email || email.trim().toLowerCase(), role: userDetails.role });
    } catch (error: any) {
      const code = error?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        Alert.alert('Usuario o contraseña incorrecta', 'Verifica tus datos e inténtalo de nuevo.');
      } else if (code === 'auth/user-not-found') {
        Alert.alert('Cuenta no encontrada', 'No existe un usuario con ese correo.');
      } else if (code === 'auth/invalid-email') {
        Alert.alert('Email inválido', 'Revisa el formato de tu correo.');
      } else if (code === 'auth/too-many-requests') {
        Alert.alert('Demasiados intentos', 'Acceso temporalmente bloqueado.');
      } else if (code === 'auth/network-request-failed') {
        Alert.alert('Error de conexión', 'No se pudo conectar. Verifica tu red.');
      } else {
        Alert.alert('Error', error?.message || 'No se pudo iniciar sesión.');
      }
    } finally {
      setEmailLoading(false);
    }
  }, [email, password, login]);

  const handleLoginGoogle = useCallback(async () => {
    setGoogleLoading(true);
    try {
      if (Platform.OS === 'web') {
        const cred = await loginGoogleProxy();
        const userDetails = await getUserDetails();
        await login({ uid: cred.user.uid, email: cred.user.email || '', role: userDetails.role });
        return;
      }
      if (Platform.OS === 'android') {
        const cred = await signInWithGoogleAndroid();
        const userDetails = await getUserDetails();
        await login({ uid: cred.user.uid, email: cred.user.email || '', role: userDetails.role });
        return;
      }
      const res = await googlePromptAsync();
      if (res?.type === 'success' && res?.params?.id_token) {
        const credential = GoogleAuthProvider.credential(res.params.id_token as string);
        const cred = await signInWithCredential(auth, credential);
        const userDetails = await getUserDetails();
        await login({ uid: cred.user.uid, email: cred.user.email || '', role: userDetails.role });
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo iniciar sesión con Google');
    } finally {
      setGoogleLoading(false);
    }
  }, [login, googlePromptAsync]);

  // ─────────────────────────────────────────────────────────────────────────
  // WEB — Split Layout
  // ─────────────────────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    return (
      <View style={webStyles.container}>
        {/* ═══ DIAGONAL RED DIVIDER — absolute over both panels ═══ */}
        <View style={webStyles.diagonalDivider} />

        {/* ═══ LEFT PANEL — Animated 3D background ═══ */}
        <AnimatedLeftPanel />

        {/* Diagonal Background (White wedge + Red line) */}
        <View style={webStyles.diagonalBackground} />

        {/* ═══ RIGHT PANEL — White form ═══ */}
        <View style={webStyles.rightPanel}>
          {/* Corner decoration */}
          <View style={webStyles.decorBoxTopRight}>
            <View style={webStyles.decorSquareInner} />
          </View>
          {/* Dot grid bottom-right */}
          <View style={webStyles.dotGrid}>
            {[0, 1, 2, 3].map(r => (
              <View key={r} style={webStyles.dotRow}>
                {[0, 1, 2, 3].map(c => (
                  <View
                    key={c}
                    style={[webStyles.dot, (r + c) % 2 === 0 && webStyles.dotActive]}
                  />
                ))}
              </View>
            ))}
          </View>

          <View style={webStyles.form}>
            {/* Badge — fondo negro */}
            <View style={webStyles.badge}>
              <Text style={webStyles.badgeText}>ACCEDER</Text>
            </View>
            {/* Title */}
            <Text style={webStyles.titleBlack}>Iniciar</Text>
            <Text style={webStyles.titleRed}>sesión</Text>
            <Text style={webStyles.subtitle}>Ingresa tus credenciales para continuar</Text>

            {/* Email */}
            <Text style={webStyles.fieldLabel}>EMAIL</Text>
            <TextInput
              style={[webStyles.input, { outlineStyle: 'none' } as any, focusedInput === 'email' && webStyles.inputFocused]}
              placeholder="tu@email.com"
              placeholderTextColor="#bbb"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              onFocus={() => setFocusedInput('email')}
              onBlur={() => setFocusedInput(null)}
            />

            {/* Password */}
            <Text style={webStyles.fieldLabel}>CONTRASEÑA</Text>
            <View style={webStyles.inputWrap}>
              <TextInput
                style={[webStyles.input, { outlineStyle: 'none' } as any, focusedInput === 'password' && webStyles.inputFocused]}
                placeholder="••••••••"
                placeholderTextColor="#bbb"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                onFocus={() => setFocusedInput('password')}
                onBlur={() => setFocusedInput(null)}
              />
              <TouchableOpacity style={webStyles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color="#999" />
              </TouchableOpacity>
            </View>

            {/* Remember + Forgot */}
            <View style={webStyles.rememberRow}>
              <TouchableOpacity style={webStyles.checkRow} onPress={() => setRememberMe(!rememberMe)}>
                <View style={[webStyles.chk, rememberMe && webStyles.chkOn]}>
                  {rememberMe && <Ionicons name="checkmark" size={11} color="#fff" />}
                </View>
                <Text style={webStyles.rememberTxt}>Recuérdame</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setForgotEmail(email); setForgotVisible(true); }}>
                <Text style={webStyles.forgotTxt}>¿Olvidaste tu contraseña?</Text>
              </TouchableOpacity>
            </View>

            {/* Login btn */}
            <TouchableOpacity
              style={[webStyles.primaryBtn, emailLoading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={emailLoading}
            >
              {emailLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={webStyles.primaryBtnTxt}>ENTRAR</Text>}
            </TouchableOpacity>

            <View style={webStyles.separatorRow}>
              <View style={webStyles.separatorLine} />
              <Text style={webStyles.separatorText}>O</Text>
              <View style={webStyles.separatorLine} />
            </View>

            {/* Google btn */}
            <TouchableOpacity
              style={[webStyles.googleBtn, googleHovered && { backgroundColor: '#111' }, googleLoading && { opacity: 0.7 }]}
              onPress={handleLoginGoogle}
              disabled={googleLoading}
              // @ts-ignore
              onMouseEnter={() => setGoogleHovered(true)}
              onMouseLeave={() => setGoogleHovered(false)}
            >
              {googleLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Image
                    source={{ uri: 'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg' }}
                    style={{ width: 18, height: 18 }}
                    resizeMode="contain"
                  />
                  <Text style={[webStyles.googleBtnTxt, googleHovered && { color: '#fff' }]}>INICIAR CON GOOGLE</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Register link */}
            <View style={webStyles.bottomRow}>
              <Text style={webStyles.bottomTxt}>¿Nuevo en Pixel No Sekai? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Registro')}>
                <Text style={webStyles.bottomLink}>Regístrate aquí</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ═══ MODAL: Forgot password ═══ */}
        <Modal visible={forgotVisible} transparent animationType="fade" onRequestClose={() => setForgotVisible(false)}>
          <View style={webStyles.modalOverlay}>
            <View style={webStyles.modalBox}>
              <Text style={webStyles.modalTitle}>Recuperar contraseña</Text>
              <Text style={webStyles.modalDesc}>
                Ingresa tu correo. Te enviaremos un enlace para restablecer tu contraseña.
              </Text>
              <TextInput
                style={webStyles.modalInput}
                placeholder="Tu correo"
                placeholderTextColor="#999"
                value={forgotEmail}
                onChangeText={setForgotEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <View style={webStyles.modalActions}>
                <TouchableOpacity
                  style={webStyles.modalBtnSec}
                  onPress={() => setForgotVisible(false)}
                  disabled={forgotLoading}
                >
                  <Text style={webStyles.modalBtnSecTxt}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[webStyles.modalBtnPri, forgotLoading && { opacity: 0.7 }]}
                  disabled={forgotLoading}
                  onPress={async () => {
                    const emailToUse = (forgotEmail || email).trim().toLowerCase();
                    if (!emailToUse) { Alert.alert('Email requerido'); return; }
                    setForgotLoading(true);
                    try {
                      await requestPasswordReset(emailToUse);
                      Alert.alert('Correo enviado', 'Revisa tu bandeja de entrada.');
                      setEmail(emailToUse);
                      setForgotVisible(false);
                    } catch (error: any) {
                      const code = error?.code || '';
                      if (code === 'auth/user-not-found') Alert.alert('Cuenta no encontrada');
                      else if (code === 'auth/invalid-email') Alert.alert('Email inválido');
                      else Alert.alert('Error', error?.message || 'No se pudo enviar el correo.');
                    } finally { setForgotLoading(false); }
                  }}
                >
                  {forgotLoading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={webStyles.modalBtnPriTxt}>Enviar enlace</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MOBILE — Original Netflix-style centered layout
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={mobileStyles.container}>
      <ImageBackground
        source={require('../assets/fondo login.jpg')}
        style={mobileStyles.backgroundImage}
        blurRadius={2}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.8)', 'rgba(0,0,0,0.9)']}
          style={mobileStyles.gradient}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={mobileStyles.keyboardView}
          >
            <ScrollView
              contentContainerStyle={mobileStyles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={mobileStyles.logoContainer}>
                <Text style={mobileStyles.logo}>Pixel No Sekai</Text>
              </View>

              <View style={mobileStyles.formContainer}>
                <Text style={mobileStyles.title}>Iniciar sesión</Text>

                <View style={mobileStyles.inputContainer}>
                  <TextInput
                    style={mobileStyles.input}
                    placeholder="Email o número de celular"
                    placeholderTextColor="#8c8c8c"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>

                <View style={mobileStyles.inputContainer}>
                  <TextInput
                    style={mobileStyles.input}
                    placeholder="Contraseña"
                    placeholderTextColor="#8c8c8c"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={mobileStyles.eyeIcon}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color="#8c8c8c" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[mobileStyles.loginButton, emailLoading && { opacity: 0.6 }]}
                  onPress={handleLogin}
                  disabled={emailLoading}
                >
                  {emailLoading
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={mobileStyles.loginButtonText}>Iniciar sesión</Text>}
                </TouchableOpacity>

                <View style={mobileStyles.separatorContainer}>
                  <View style={mobileStyles.separator} />
                  <Text style={mobileStyles.separatorText}>O</Text>
                  <View style={mobileStyles.separator} />
                </View>

                <TouchableOpacity
                  style={[mobileStyles.googleButton, googleLoading && { opacity: 0.6 }]}
                  onPress={handleLoginGoogle}
                  disabled={googleLoading}
                >
                  {googleLoading ? (
                    <ActivityIndicator color="#000000" />
                  ) : (
                    <>
                      <Ionicons name="logo-google" size={20} color="#000" style={{ marginRight: 8 }} />
                      <Text style={mobileStyles.googleButtonText}>Iniciar sesión con Google</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={mobileStyles.forgotPassword}
                  onPress={() => { setForgotEmail(email); setForgotVisible(true); }}
                >
                  <Text style={mobileStyles.forgotPasswordText}>¿Olvidaste la contraseña?</Text>
                </TouchableOpacity>

                <View style={mobileStyles.rememberContainer}>
                  <TouchableOpacity
                    style={mobileStyles.checkbox}
                    onPress={() => setRememberMe(!rememberMe)}
                  >
                    <View style={[mobileStyles.checkboxBox, rememberMe && mobileStyles.checkboxBoxChecked]}>
                      {rememberMe && <Ionicons name="checkmark" size={16} color="#000" />}
                    </View>
                    <Text style={mobileStyles.rememberText}>Recordarme</Text>
                  </TouchableOpacity>
                </View>

                <View style={mobileStyles.signupContainer}>
                  <Text style={mobileStyles.signupText}>¿Primera vez en Pixel No Sekai?</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Registro')}>
                    <Text style={mobileStyles.signupLink}>Regístrate aquí.</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>

          {/* Modal: Recuperar contraseña */}
          <Modal
            visible={forgotVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setForgotVisible(false)}
          >
            <View style={mobileStyles.modalOverlay}>
              <View style={mobileStyles.modalContent}>
                <Text style={mobileStyles.modalTitle}>Recuperar contraseña</Text>
                <Text style={mobileStyles.modalDesc}>
                  Ingresa tu correo asociado a la cuenta. Te enviaremos un enlace para restablecer tu contraseña.
                </Text>
                <TextInput
                  style={mobileStyles.modalInput}
                  placeholder="Tu correo"
                  placeholderTextColor="#8c8c8c"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <View style={mobileStyles.modalActions}>
                  <TouchableOpacity
                    style={[mobileStyles.modalButton, mobileStyles.modalButtonSecondary]}
                    onPress={() => setForgotVisible(false)}
                    disabled={forgotLoading}
                  >
                    <Text style={mobileStyles.modalButtonText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[mobileStyles.modalButton, forgotLoading && { opacity: 0.7 }]}
                    onPress={async () => {
                      const emailToUse = (forgotEmail || email).trim().toLowerCase();
                      if (!emailToUse) { Alert.alert('Email requerido', 'Ingresa tu correo para continuar.'); return; }
                      setForgotLoading(true);
                      try {
                        await requestPasswordReset(emailToUse);
                        Alert.alert('Correo enviado', 'Revisa tu bandeja de entrada y sigue el enlace para restablecer tu contraseña.');
                        setEmail(emailToUse);
                        setForgotVisible(false);
                      } catch (error: any) {
                        const code = error?.code || '';
                        if (code === 'auth/user-not-found') Alert.alert('Cuenta no encontrada', 'No existe un usuario con ese correo.');
                        else if (code === 'auth/invalid-email') Alert.alert('Email inválido', 'Revisa el formato de tu correo.');
                        else if (code === 'auth/network-request-failed') Alert.alert('Error de conexión', 'No se pudo conectar. Verifica tu red.');
                        else Alert.alert('Error', error?.message || 'No se pudo enviar el correo de recuperación.');
                      } finally { setForgotLoading(false); }
                    }}
                    disabled={forgotLoading}
                  >
                    {forgotLoading
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text style={mobileStyles.modalButtonText}>Enviar enlace</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </LinearGradient>
      </ImageBackground>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WEB STYLES — Split Layout
// ═══════════════════════════════════════════════════════════════════════════
const webStyles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#000', position: 'relative' },

  // ── Diagonal red divider — sits on top of both panels at container level ──
  // Positioned so its center aligns with the right edge of the left panel.
  // A wide strip + pronounced skewX gives the thick angled divider look.
  // ── Diagonal Background ──
  // A wide skewed block that provides the white background for the right panel
  // and the thick red diagonal border on its left edge.
  diagonalBackground: {
    position: 'absolute',
    top: -100,
    bottom: -100,
    right: -100,
    width: 600,
    backgroundColor: '#fff',
    borderLeftWidth: 10,
    borderLeftColor: '#E50914',
    transform: [{ skewX: '3deg' }],
    zIndex: 10,
  },

  // ── Left Panel ──
  leftPanel: { flex: 1, backgroundColor: '#0a0a0a', position: 'relative', overflow: 'hidden' },
  particle: { position: 'absolute', backgroundColor: '#E50914', borderRadius: 2 },
  particleOut: { position: 'absolute', backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(229,9,20,0.4)', borderRadius: 2 },
  pSm: { width: 8, height: 8 },
  pMd: { width: 13, height: 13 },
  geomAccent1: { position: 'absolute', bottom: 0, right: -80, width: 480, height: 420, backgroundColor: 'rgba(120,0,0,0.35)', transform: [{ skewX: '15deg' }] },
  geomAccent2: { position: 'absolute', bottom: 0, right: 60, width: 260, height: 260, backgroundColor: 'rgba(229,9,20,0.10)', transform: [{ skewX: '15deg' }] },
  topLogo: { position: 'absolute', top: 28, left: 32, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 5 },
  logoIconBox: { width: 28, height: 28, backgroundColor: '#E50914', borderRadius: 0, justifyContent: 'center', alignItems: 'center' },
  logoText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 1.5 },
  brandingBlock: { position: 'absolute', bottom: 72, left: 40, zIndex: 5 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  accentBar: { width: 3, height: 16, backgroundColor: '#E50914' },
  subtitleText: { color: '#E50914', fontSize: 12, fontWeight: '600', letterSpacing: 3 },
  heroWhite: { color: '#fff', fontSize: 67, fontWeight: '900', letterSpacing: -1, lineHeight: 70 },
  heroRed: { color: '#E50914', fontSize: 67, fontWeight: '900', letterSpacing: -1, lineHeight: 70 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 28, gap: 16 },
  statItem: { alignItems: 'center' },
  statIcon: { width: 28, height: 28, borderRadius: 0, borderWidth: 1, borderColor: 'rgba(229,9,20,0.4)', justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  statVal: { color: '#fff', fontSize: 14, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 38, backgroundColor: 'rgba(255,255,255,0.1)' },
  rightPanel: { width: 500, backgroundColor: 'transparent', paddingHorizontal: 75, paddingVertical: 40, justifyContent: 'center', position: 'relative', overflow: 'hidden', zIndex: 20 },
  decorBoxTopRight: { position: 'absolute', top: 0, right: 0, width: 120, height: 120, backgroundColor: 'rgba(229, 9, 20, 0.06)', justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  decorSquareInner: { width: 60, height: 60, borderWidth: 2, borderColor: 'rgba(229, 9, 20, 0.25)' },
  dotGrid: { position: 'absolute', bottom: 30, left: 80, gap: 6 },
  dotRow: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 2, backgroundColor: 'rgba(229,9,20,0.1)' },
  dotActive: { backgroundColor: 'rgba(229,9,20,0.35)' },
  form: { width: '100%' },
  badge: { alignSelf: 'flex-start', backgroundColor: '#111', borderWidth: 1.5, borderColor: '#111', borderRadius: 0, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 16 },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 1.2 },
  titleBlack: { color: '#111', fontSize: 34, fontWeight: '900', lineHeight: 34 },
  titleRed: { color: '#E50914', fontSize: 34, fontWeight: '900', lineHeight: 34, marginBottom: 8 },
  subtitle: { color: '#000', fontSize: 14, marginBottom: 22, opacity: 0.5 },
  fieldLabel: { color: '#111', fontSize: 13, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 0, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#111', marginBottom: 14, backgroundColor: '#fff' },
  inputFocused: { borderColor: '#E50914', backgroundColor: '#fff' },
  inputWrap: { position: 'relative', marginBottom: 0 },
  eyeBtn: { position: 'absolute', right: 14, top: 13 },
  rememberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 18 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chk: { width: 16, height: 16, borderWidth: 1.5, borderColor: '#ccc', borderRadius: 0, justifyContent: 'center', alignItems: 'center' },
  chkOn: { backgroundColor: '#E50914', borderColor: '#E50914' },
  rememberTxt: { color: '#666', fontSize: 14 },
  forgotTxt: { color: '#E50914', fontSize: 14, fontWeight: 'bold' },
  primaryBtn: { backgroundColor: '#E50914', borderRadius: 0, paddingVertical: 14, alignItems: 'center', marginBottom: 14 },
  primaryBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 1.5 },
  separatorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  separatorText: { color: '#ccc', fontSize: 13, fontWeight: '600' },
  googleBtn: { borderWidth: 1.5, borderColor: '#222', borderRadius: 0, paddingVertical: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 20 },
  googleBtnTxt: { color: '#111', fontSize: 14, fontWeight: '700', letterSpacing: 0.8 },

  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  bottomTxt: { color: '#888', fontSize: 12 },
  bottomLink: { color: '#111', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },

  // Modal
  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 28,
  },
  modalTitle: { color: '#111', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  modalDesc: { color: '#666', fontSize: 13, marginBottom: 18, lineHeight: 20 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111',
    marginBottom: 18,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalBtnSec: { backgroundColor: '#eee', borderRadius: 6, paddingVertical: 10, paddingHorizontal: 18 },
  modalBtnSecTxt: { color: '#333', fontSize: 13, fontWeight: '700' },
  modalBtnPri: { backgroundColor: '#E50914', borderRadius: 6, paddingVertical: 10, paddingHorizontal: 18 },
  modalBtnPriTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

// ═══════════════════════════════════════════════════════════════════════════
// MOBILE STYLES — Original Netflix-style
// ═══════════════════════════════════════════════════════════════════════════
const mobileStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  gradient: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 40 },
  logoContainer: { alignItems: 'center', marginBottom: 50, marginTop: 0 },
  logo: { fontSize: 40, fontWeight: 'bold', color: '#E50914', letterSpacing: 2 },
  formContainer: {
    width: '90%',
    maxWidth: 450,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 4,
    padding: 60,
  },
  title: { fontSize: 32, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 28 },
  inputContainer: { position: 'relative', marginBottom: 16 },
  input: {
    backgroundColor: '#333333',
    borderRadius: 4,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#333333',
  },
  eyeIcon: { position: 'absolute', right: 16, top: 16 },
  loginButton: {
    backgroundColor: '#E50914',
    borderRadius: 4,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  loginButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  separatorContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  separator: { flex: 1, height: 1, backgroundColor: '#333333' },
  separatorText: { color: '#8c8c8c', paddingHorizontal: 16, fontSize: 14 },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  googleButtonText: { color: '#000000', fontSize: 14, fontWeight: 'bold' },
  forgotPassword: { alignItems: 'center', marginTop: 8, marginBottom: 16 },
  forgotPasswordText: { color: '#b3b3b3', fontSize: 13 },
  rememberContainer: { marginBottom: 16 },
  checkbox: { flexDirection: 'row', alignItems: 'center' },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#8c8c8c',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxChecked: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  rememberText: { color: '#b3b3b3', fontSize: 13 },
  signupContainer: { flexDirection: 'row', marginTop: 16, flexWrap: 'wrap' },
  signupText: { color: '#8c8c8c', fontSize: 16, marginRight: 6 },
  signupLink: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: 6,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  modalDesc: { color: '#b3b3b3', fontSize: 14, marginBottom: 16 },
  modalInput: {
    backgroundColor: '#333333',
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#333333',
    marginBottom: 12,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  modalButton: {
    backgroundColor: '#E50914',
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  modalButtonSecondary: { backgroundColor: '#333333' },
  modalButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
});