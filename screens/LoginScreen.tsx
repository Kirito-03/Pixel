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
  useWindowDimensions,
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
import Loader from '../components/Loader';

export default function LoginScreen({ navigation }: any) {
  const { height: screenHeight } = useWindowDimensions();
  const heroHeight = Math.max(180, screenHeight * 0.35); // 35% of screen, min 180px

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
        {/* Full-screen Loader Overlay */}
        {(emailLoading || googleLoading) && (
          <View style={StyleSheet.absoluteFillObject}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
              <Loader />
            </View>
          </View>
        )}



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
                    source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }}
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
  // MOBILE — Original Pixel-style centered layout
  // ─────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  // MOBILE — Custom Angled Layout
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={mobileStyles.container}
    >
      {/* Full-screen Loader Overlay */}
      {(emailLoading || googleLoading) && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }]}>
          <Loader />
        </View>
      )}

      <ScrollView
        contentContainerStyle={[mobileStyles.scrollContent, { minHeight: screenHeight }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {/* ═══ TOP HERO SECTION (Black) ═══ */}
        <View style={[mobileStyles.topHero, { height: heroHeight }]}>
          {/* Animated Background */}
          <View style={StyleSheet.absoluteFillObject}>
             <AnimatedLeftPanel fullScreenMode={true} />
          </View>
          
          {/* Top Logo */}
          <View style={mobileStyles.topLogo}>
            <View style={mobileStyles.logoIconBox}>
              <Ionicons name="play" size={14} color="#fff" />
            </View>
            <Text style={mobileStyles.logoText}>PIXEL NO SEKAI</Text>
          </View>
          
          {/* Branding */}
          <View style={mobileStyles.brandingBlock}>
            <View style={mobileStyles.subtitleRow}>
              <View style={mobileStyles.accentBar} />
              <Text style={mobileStyles.subtitleText}>TU MUNDO DE ANIME</Text>
            </View>
            <Text style={mobileStyles.heroWhite}>PIXEL</Text>
            <Text style={mobileStyles.heroRed}>NO</Text>
            <Text style={mobileStyles.heroWhite}>SEKAI</Text>
          </View>

          {/* Stats on the right side */}
          <View style={mobileStyles.statsContainer}>
            <View style={mobileStyles.statRowBox}>
               <View style={mobileStyles.statIcon}><Ionicons name="play" size={10} color="#E50914"/></View>
               <Text style={mobileStyles.statVal}>10K+</Text>
            </View>
            <View style={mobileStyles.statRowBox}>
               <View style={mobileStyles.statIcon}><Ionicons name="star" size={10} color="#E50914"/></View>
               <Text style={mobileStyles.statVal}>4.9</Text>
            </View>
            <View style={mobileStyles.statRowBox}>
               <View style={mobileStyles.statIcon}><Ionicons name="flash" size={10} color="#E50914"/></View>
               <Text style={mobileStyles.statVal}>HD</Text>
            </View>
          </View>
        </View>

        {/* ═══ BOTTOM FORM SECTION (White) ═══ */}
        <View style={mobileStyles.bottomFormContainer}>
          {/* Diagonal cut */}
          <View style={mobileStyles.diagonalCut} />
          <View style={mobileStyles.decorSquareOuter}>
            <View style={mobileStyles.decorSquareInner} />
          </View>

          <View style={mobileStyles.formContent}>
            {/* ACCEDER badge */}
            <View style={mobileStyles.badge}>
              <Text style={mobileStyles.badgeText}>ACCEDER</Text>
            </View>
            
            <View style={mobileStyles.titleRow}>
              <Text style={mobileStyles.titleBlack}>Iniciar</Text>
            </View>
            <Text style={mobileStyles.titleRed}>sesión</Text>
            <Text style={mobileStyles.subtitle}>Ingresa tus credenciales para continuar</Text>
            
            {/* Email */}
            <Text style={mobileStyles.fieldLabel}>EMAIL</Text>
            <TextInput 
              style={[mobileStyles.input, focusedInput === 'email' && mobileStyles.inputFocused]} 
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
            <Text style={mobileStyles.fieldLabel}>CONTRASEÑA</Text>
            <View style={mobileStyles.inputWrap}>
              <TextInput 
                style={[mobileStyles.input, focusedInput === 'password' && mobileStyles.inputFocused]} 
                placeholder="••••••••" 
                placeholderTextColor="#bbb" 
                value={password} 
                onChangeText={setPassword} 
                secureTextEntry={!showPassword} 
                autoCapitalize="none" 
                onFocus={() => setFocusedInput('password')}
                onBlur={() => setFocusedInput(null)}
              />
              <TouchableOpacity style={mobileStyles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#bbb" />
              </TouchableOpacity>
            </View>
            
            {/* Remember Me & Forgot Password */}
            <View style={mobileStyles.rememberRow}>
              <TouchableOpacity style={mobileStyles.checkRow} onPress={() => setRememberMe(!rememberMe)}>
                <View style={[mobileStyles.chk, rememberMe && mobileStyles.chkOn]}>
                  {rememberMe && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                <Text style={mobileStyles.rememberTxt}>Recuérdame</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setForgotEmail(email); setForgotVisible(true); }}>
                <Text style={mobileStyles.forgotTxt}>¿Olvidaste tu contraseña?</Text>
              </TouchableOpacity>
            </View>

            {/* Login Button */}
            <TouchableOpacity 
              style={[mobileStyles.primaryBtn, emailLoading && { opacity: 0.7 }]} 
              onPress={handleLogin} 
              disabled={emailLoading}
            >
              {emailLoading ? <ActivityIndicator color="#fff" /> : <Text style={mobileStyles.primaryBtnTxt}>ENTRAR</Text>}
            </TouchableOpacity>

            {/* Separator */}
            <View style={mobileStyles.separatorRow}>
              <View style={mobileStyles.separatorLine} />
              <View style={mobileStyles.separatorDot} />
              <View style={mobileStyles.separatorLine} />
            </View>

            {/* Google Button */}
            <TouchableOpacity 
              style={[mobileStyles.googleBtn, googleLoading && { opacity: 0.7 }]} 
              onPress={handleLoginGoogle} 
              disabled={googleLoading}
            >
              {googleLoading ? <ActivityIndicator color="#000" /> : (
                <>
                  <Image source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }} style={{ width: 18, height: 18 }} />
                  <Text style={mobileStyles.googleBtnTxt}>INICIAR CON GOOGLE</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Registration Link */}
            <View style={mobileStyles.bottomRow}>
              <Text style={mobileStyles.bottomTxt}>¿Nuevo en Pixel No Sekai? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Registro')}>
                <Text style={mobileStyles.bottomLink}>Regístrate aquí</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ═══ MODAL: Forgot password ═══ */}
      <Modal visible={forgotVisible} transparent animationType="fade" onRequestClose={() => setForgotVisible(false)}>
        <View style={mobileStyles.modalOverlay}>
          <View style={mobileStyles.modalBox}>
            <Text style={mobileStyles.modalTitle}>Recuperar contraseña</Text>
            <Text style={mobileStyles.modalDesc}>
              Ingresa tu correo. Te enviaremos un enlace para restablecer tu contraseña.
            </Text>
            <TextInput
              style={mobileStyles.modalInput}
              placeholder="Tu correo"
              placeholderTextColor="#999"
              value={forgotEmail}
              onChangeText={setForgotEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={mobileStyles.modalActions}>
              <TouchableOpacity style={mobileStyles.modalBtnSec} onPress={() => setForgotVisible(false)} disabled={forgotLoading}>
                <Text style={mobileStyles.modalBtnSecTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[mobileStyles.modalBtnPri, forgotLoading && { opacity: 0.7 }]}
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
                {forgotLoading ? <ActivityIndicator color="#fff" /> : <Text style={mobileStyles.modalBtnPriTxt}>Enviar enlace</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
// MOBILE STYLES — Original Pixel-style
// ═══════════════════════════════════════════════════════════════════════════
const mobileStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scrollContent: { flexGrow: 1 },
  
  // ── TOP HERO (Black) ──
  topHero: {
    width: '100%',
    backgroundColor: '#0a0a0a',
    position: 'relative',
    overflow: 'hidden',
  },
  topLogo: { position: 'absolute', top: 40, left: 24, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 5 },
  logoIconBox: { width: 24, height: 24, backgroundColor: '#E50914', justifyContent: 'center', alignItems: 'center' },
  logoText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 1.5 },
  
  brandingBlock: { position: 'absolute', bottom: 50, left: 24, zIndex: 5 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  accentBar: { width: 3, height: 14, backgroundColor: '#E50914' },
  subtitleText: { color: '#E50914', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  heroWhite: { color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: -1, lineHeight: 44 },
  heroRed: { color: '#E50914', fontSize: 44, fontWeight: '900', letterSpacing: -1, lineHeight: 44 },
  
  statsContainer: { position: 'absolute', bottom: 60, right: 24, zIndex: 5, gap: 10 },
  statRowBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 8 },
  statIcon: { width: 22, height: 22, borderWidth: 1, borderColor: 'rgba(229,9,20,0.4)', justifyContent: 'center', alignItems: 'center' },
  statVal: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // ── BOTTOM FORM (White) ──
  bottomFormContainer: {
    flex: 1,
    backgroundColor: '#fff',
    marginTop: -20, // Overlap with top section
    position: 'relative',
  },
  diagonalCut: {
    position: 'absolute',
    top: -24,
    left: -10,
    right: -10,
    height: 60,
    backgroundColor: '#fff',
    borderTopWidth: 4,
    borderTopColor: '#E50914',
    transform: [{ rotate: '-4deg' }],
    zIndex: 1,
  },
  decorSquareOuter: { position: 'absolute', top: 16, right: 0, width: 80, height: 80, backgroundColor: 'rgba(229, 9, 20, 0.05)', justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  decorSquareInner: { width: 40, height: 40, borderWidth: 2, borderColor: 'rgba(229, 9, 20, 0.2)' },
  
  formContent: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 30,
    paddingBottom: 20,
    zIndex: 10,
  },
  badge: { alignSelf: 'flex-start', backgroundColor: '#000', paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  titleRow: { flexDirection: 'row' },
  titleBlack: { color: '#111', fontSize: 26, fontWeight: '900', lineHeight: 28 },
  titleRed: { color: '#E50914', fontSize: 26, fontWeight: '900', lineHeight: 28, marginBottom: 4 },
  subtitle: { color: '#777', fontSize: 13, marginBottom: 16 },
  
  fieldLabel: { color: '#111', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4, marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#111', marginBottom: 12, backgroundColor: '#fff' },
  inputFocused: { borderColor: '#E50914' },
  inputWrap: { position: 'relative' },
  eyeBtn: { position: 'absolute', right: 14, top: 10 },
  
  rememberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 0 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chk: { width: 16, height: 16, borderWidth: 1, borderColor: '#bbb', justifyContent: 'center', alignItems: 'center' },
  chkOn: { backgroundColor: '#E50914', borderColor: '#E50914' },
  rememberTxt: { color: '#666', fontSize: 13 },
  forgotTxt: { color: '#E50914', fontSize: 12, fontWeight: '700' },
  
  primaryBtn: { backgroundColor: '#E50914', paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
  primaryBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 1.5 },
  
  separatorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  separatorDot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff' },
  
  googleBtn: { borderWidth: 1, borderColor: '#000', paddingVertical: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 20 },
  googleBtnTxt: { color: '#000', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  
  bottomRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  bottomTxt: { color: '#888', fontSize: 13 },
  bottomLink: { color: '#111', fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },

  // Modal (Same design as web, adapted for mobile sizing)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { width: '100%', backgroundColor: '#fff', borderRadius: 8, padding: 24 },
  modalTitle: { color: '#111', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  modalDesc: { color: '#666', fontSize: 13, marginBottom: 18, lineHeight: 18 },
  modalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 4, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#111', marginBottom: 18 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalBtnSec: { backgroundColor: '#eee', borderRadius: 4, paddingVertical: 10, paddingHorizontal: 16 },
  modalBtnSecTxt: { color: '#333', fontSize: 13, fontWeight: '700' },
  modalBtnPri: { backgroundColor: '#E50914', borderRadius: 4, paddingVertical: 10, paddingHorizontal: 16 },
  modalBtnPriTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
});