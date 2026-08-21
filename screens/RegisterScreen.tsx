import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ImageBackground,
  useWindowDimensions,
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AnimatedLeftPanel from '../components/AnimatedLeftPanel';
import databaseService from '../services/databaseService';
import { registerEmail, loginGoogle as loginGoogleProxy, signInWithGoogleAndroid, getUserDetails } from '../services/auth';
import * as GoogleAuth from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';

type Step = 'email' | 'profile';

const RegisterScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { login } = useAuth();
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;

  const [currentStep, setCurrentStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profileName, setProfileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleHovered, setGoogleHovered] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [legalConsent, setLegalConsent] = useState(false);
  const fileInputRef = React.useRef<any>(null);

  const [googleRequest, googleResponse, googlePromptAsync] = GoogleAuth.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID_RELEASE || process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
  });

  const validateEmail = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) newErrors.email = 'El email es requerido';
    else if (!emailRegex.test(email)) newErrors.email = 'Ingresa un email válido';
    if (!password) newErrors.password = 'La contraseña es requerida';
    else if (password.length < 6) newErrors.password = 'Mínimo 6 caracteres';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateProfile = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (!profileName.trim()) newErrors.profileName = 'El nombre del perfil es requerido';
    if (!selectedImageUri) newErrors.avatar = 'Debes seleccionar una foto de perfil';
    if (!legalConsent) newErrors.legal = 'Debes aceptar los Términos y la Política de Privacidad';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSelectProfileImage = async () => {
    if (Platform.OS === 'web') {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
      return;
    }

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permisos requeridos', 'Necesitamos acceso a tu galería.', [{ text: 'OK' }]);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      setSelectedImageUri(result.assets[0].uri);
    } catch (error) {
      console.error('Error al seleccionar imagen:', error);
      Alert.alert('Error', 'No se pudo seleccionar la imagen');
    }
  };

  const handleWebFileSelect = async (event: any) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrors(prev => ({ ...prev, avatar: 'Por favor selecciona un archivo de imagen' }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, avatar: 'El archivo es demasiado grande. Máximo 5MB' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImageUri(e.target?.result as string);
      setErrors(prev => ({ ...prev, avatar: '' }));
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleNext = () => {
    if (currentStep === 'email') {
      if (validateEmail()) setCurrentStep('profile');
    }
  };

  const handleBack = () => {
    if (currentStep === 'profile') setCurrentStep('email');
  };

  const handleRegister = async () => {
    if (!validateProfile()) return;
    setLoading(true);
    try {
      const cred = await registerEmail(email.trim().toLowerCase(), password);
      
      setUploadingImage(true);
      let avatarUrl: string;
      if (!selectedImageUri) throw new Error('Debes seleccionar una foto de perfil');

      const uploadResult = await databaseService.uploadAvatar(selectedImageUri);
      avatarUrl = uploadResult.url;
      setUploadingImage(false);

      const profileResult = await databaseService.createProfile({
        usuario_id: 0,
        name: profileName.trim() || 'Mi Perfil',
        avatar_url: avatarUrl,
      });

      // Sync AuthContext state after successful registration
      const userDetails = await getUserDetails();
      await login({ uid: cred.user.uid, email: cred.user.email || email.trim().toLowerCase(), role: userDetails.role });
      
      const profiles = await databaseService.getProfiles(0);
      const createdProfile = profiles.find((p: any) => p.id === profileResult.id);

      if (createdProfile) {
        navigation.reset({ index: 0, routes: [{ name: 'Principal', params: { selectedProfile: createdProfile } }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'SeleccionPerfil' }] });
      }
    } catch (error: any) {
      if (error?.code === 'auth/email-already-in-use') {
        Alert.alert('Email en uso', 'Este email ya está registrado. Inicia sesión o usa otro email.');
      } else {
        Alert.alert('Error', error?.message || 'No se pudo crear tu cuenta.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoginGoogle = async () => {
    try {
      setGoogleLoading(true);
      let cred: any;
      if (Platform.OS === 'web') {
        cred = await loginGoogleProxy();
      } else if (Platform.OS === 'android') {
        cred = await signInWithGoogleAndroid();
      } else {
        const res = await googlePromptAsync();
        if (res?.type === 'success' && res?.params?.id_token) {
          const credential = GoogleAuthProvider.credential(res.params.id_token as string);
          cred = await signInWithCredential(auth, credential);
        } else {
          cred = await loginGoogleProxy();
        }
      }
      // Sync AuthContext state
      if (cred?.user) {
        const userDetails = await getUserDetails();
        await login({ uid: cred.user.uid, email: cred.user.email || '', role: userDetails.role });
      }
      navigation.reset({ index: 0, routes: [{ name: 'SeleccionPerfil' }] });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo continuar con Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  const clearError = (field: string) => {
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // WEB — Split Layout Renderers
  // ─────────────────────────────────────────────────────────────────────────
  const renderWebEmailStep = () => (
    <View style={webStyles.formWrapper}>
      <View style={webStyles.badge}>
        <Text style={webStyles.badgeText}>REGISTRO</Text>
      </View>
      <Text style={webStyles.formTitle}>Crea tu</Text>
      <Text style={webStyles.formTitleRed}>cuenta</Text>
      <Text style={webStyles.formSubtitle}>Ingresa tu email y contraseña para empezar</Text>

      <View style={webStyles.stepRow}>
        <View style={webStyles.stepCircleActive}><Text style={webStyles.stepNumActive}>1</Text></View>
        <View style={webStyles.stepLine} />
        <View style={webStyles.stepCircle}><Text style={webStyles.stepNum}>2</Text></View>
        <Text style={webStyles.stepLabel}>Paso 1 de 2</Text>
      </View>

      <Text style={webStyles.fieldLabel}>EMAIL</Text>
      <View style={webStyles.inputContainer}>
        <TextInput
          style={[webStyles.input, { outlineStyle: 'none' } as any, focusedInput === 'email' && webStyles.inputFocused, errors.email && webStyles.inputError]}
          placeholder="tu@email.com"
          placeholderTextColor="#b0b0b0"
          value={email}
          onChangeText={(t) => { setEmail(t.toLowerCase()); clearError('email'); }}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
          onFocus={() => setFocusedInput('email')}
          onBlur={() => setFocusedInput(null)}
        />
      </View>
      {errors.email && <Text style={webStyles.errorText}>{errors.email}</Text>}

      <Text style={webStyles.fieldLabel}>CONTRASEÑA</Text>
      <View style={webStyles.inputContainer}>
        <TextInput
          style={[webStyles.input, { outlineStyle: 'none' } as any, focusedInput === 'password' && webStyles.inputFocused, errors.password && webStyles.inputError]}
          placeholder="••••••••"
          placeholderTextColor="#b0b0b0"
          value={password}
          onChangeText={(t) => { setPassword(t); clearError('password'); }}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          editable={!loading}
          onFocus={() => setFocusedInput('password')}
          onBlur={() => setFocusedInput(null)}
        />
        <TouchableOpacity style={webStyles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
          <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color="#999" />
        </TouchableOpacity>
      </View>
      {errors.password && <Text style={webStyles.errorText}>{errors.password}</Text>}

      <TouchableOpacity style={webStyles.primaryButton} onPress={handleNext} disabled={loading}>
        <Text style={webStyles.primaryButtonText}>SIGUIENTE</Text>
      </TouchableOpacity>

      <View style={webStyles.separatorRow}>
        <View style={webStyles.separatorLine} />
        <Text style={webStyles.separatorText}>O</Text>
        <View style={webStyles.separatorLine} />
      </View>

      <TouchableOpacity
        style={[webStyles.googleButton, googleHovered && { backgroundColor: '#111' }, googleLoading && { opacity: 0.7 }]}
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
            <Text style={[webStyles.googleButtonText, googleHovered && { color: '#fff' }]}>CONTINUAR CON GOOGLE</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={webStyles.bottomLink}>
        <Text style={webStyles.bottomLinkText}>¿Ya tienes cuenta? </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Ingreso')}>
          <Text style={webStyles.bottomLinkBold}>Inicia sesión</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderWebProfileStep = () => (
    <View style={webStyles.formWrapper}>
      <View style={webStyles.badge}>
        <Text style={webStyles.badgeText}>REGISTRO</Text>
      </View>
      <Text style={webStyles.formTitle}>¡Casi</Text>
      <Text style={webStyles.formTitleRed}>terminamos!</Text>
      <Text style={webStyles.formSubtitle}>Crea tu perfil para comenzar tu experiencia</Text>

      <View style={webStyles.stepRow}>
        <View style={webStyles.stepCircleCompleted}><Ionicons name="checkmark" size={12} color="#fff" /></View>
        <View style={webStyles.stepLineActive} />
        <View style={webStyles.stepCircleActive}><Text style={webStyles.stepNumActive}>2</Text></View>
        <Text style={webStyles.stepLabel}>Paso 2 de 2</Text>
      </View>

      <Text style={webStyles.fieldLabel}>NOMBRE DEL PERFIL</Text>
      <View style={webStyles.inputContainer}>
        <TextInput
          style={[webStyles.input, { outlineStyle: 'none' } as any, focusedInput === 'profileName' && webStyles.inputFocused, errors.profileName && webStyles.inputError]}
          placeholder="Tu nombre"
          placeholderTextColor="#b0b0b0"
          value={profileName}
          onChangeText={(t) => { setProfileName(t); clearError('profileName'); }}
          autoCapitalize="words"
          editable={!loading}
          onFocus={() => setFocusedInput('profileName')}
          onBlur={() => setFocusedInput(null)}
        />
      </View>
      {errors.profileName && <Text style={webStyles.errorText}>{errors.profileName}</Text>}

      <Text style={webStyles.fieldLabel}>FOTO DE PERFIL</Text>
      <TouchableOpacity
        style={webStyles.avatarPicker}
        onPress={handleSelectProfileImage}
        disabled={loading || uploadingImage}
      >
        {selectedImageUri ? (
          <Image source={{ uri: selectedImageUri }} style={webStyles.avatarPreview} />
        ) : (
          <View style={webStyles.avatarPlaceholder}>
            {uploadingImage ? (
              <ActivityIndicator size="large" color="#E50914" />
            ) : (
              <>
                <Ionicons name="camera" size={32} color="#ccc" />
                <Text style={webStyles.avatarPlaceholderText}>Seleccionar imagen</Text>
              </>
            )}
          </View>
        )}
      </TouchableOpacity>
      {errors.avatar && <Text style={webStyles.errorText}>{errors.avatar}</Text>}

      <input
        // @ts-ignore
        ref={(el: HTMLInputElement) => { fileInputRef.current = el; }}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleWebFileSelect}
      />

      <TouchableOpacity 
        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginTop: 10 }}
        onPress={() => { setLegalConsent(!legalConsent); clearError('legal'); }}
      >
        <View style={{ width: 24, height: 24, borderWidth: 2, borderColor: legalConsent ? '#E50914' : '#ccc', borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginRight: 10, backgroundColor: legalConsent ? '#E50914' : 'transparent' }}>
          {legalConsent && <Ionicons name="checkmark" size={16} color="#fff" />}
        </View>
        <Text style={{ color: '#121212', fontSize: 14 }}>
          He leído y acepto los <Text style={{ textDecorationLine: 'underline' }} onPress={() => navigation.navigate('LegalScreen', { type: 'terms' })}>Términos</Text> y la <Text style={{ textDecorationLine: 'underline' }} onPress={() => navigation.navigate('LegalScreen', { type: 'privacy' })}>Política de Privacidad</Text>
        </Text>
      </TouchableOpacity>
      {errors.legal && <Text style={[webStyles.errorText, { marginTop: -15, marginBottom: 15 }]}>{errors.legal}</Text>}

      <View style={[webStyles.buttonRow, { marginBottom: 21 }]}>
        <TouchableOpacity style={webStyles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={18} color="#666" />
          <Text style={webStyles.backButtonText}>Atrás</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[webStyles.primaryButton, { flex: 1, marginTop: 0, marginBottom: 0 }, (loading || uploadingImage) && { opacity: 0.7 }]}
          onPress={handleRegister}
          disabled={loading || uploadingImage}
        >
          {loading || uploadingImage ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={webStyles.primaryButtonText}>CREAR CUENTA</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // MOBILE — Custom Angled Layout Renderers
  // ─────────────────────────────────────────────────────────────────────────
  const renderMobileEmailStep = () => (
    <View style={mobileStyles.formContent}>
      <View style={mobileStyles.badge}>
        <Text style={mobileStyles.badgeText}>REGISTRO</Text>
      </View>
      <View style={mobileStyles.titleRow}>
        <Text style={mobileStyles.titleBlack}>Crea tu </Text>
      </View>
      <Text style={mobileStyles.titleRed}>cuenta</Text>
      <Text style={mobileStyles.subtitle}>Ingresa tu email y contraseña para empezar</Text>

      {/* Step Indicator */}
      <View style={mobileStyles.stepRow}>
        <View style={mobileStyles.stepCircleActive}><Text style={mobileStyles.stepNumActive}>1</Text></View>
        <View style={mobileStyles.stepLine} />
        <View style={mobileStyles.stepCircle}><Text style={mobileStyles.stepNum}>2</Text></View>
        <Text style={mobileStyles.stepLabel}>Paso 1 de 2</Text>
      </View>

      <Text style={mobileStyles.fieldLabel}>EMAIL</Text>
      <TextInput
        style={[mobileStyles.input, focusedInput === 'email' && mobileStyles.inputFocused, errors.email && mobileStyles.inputError]}
        placeholder="tu@email.com"
        placeholderTextColor="#bbb"
        value={email}
        onChangeText={(t) => { setEmail(t.toLowerCase()); clearError('email'); }}
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!loading}
        onFocus={() => setFocusedInput('email')}
        onBlur={() => setFocusedInput(null)}
      />
      {errors.email && <Text style={mobileStyles.errorText}>{errors.email}</Text>}

      <Text style={mobileStyles.fieldLabel}>CONTRASEÑA</Text>
      <View style={mobileStyles.inputWrap}>
        <TextInput
          style={[mobileStyles.input, focusedInput === 'password' && mobileStyles.inputFocused, errors.password && mobileStyles.inputError]}
          placeholder="••••••••"
          placeholderTextColor="#bbb"
          value={password}
          onChangeText={(t) => { setPassword(t); clearError('password'); }}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          editable={!loading}
          onFocus={() => setFocusedInput('password')}
          onBlur={() => setFocusedInput(null)}
        />
        <TouchableOpacity style={mobileStyles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
          <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#bbb" />
        </TouchableOpacity>
      </View>
      {errors.password && <Text style={mobileStyles.errorText}>{errors.password}</Text>}

      <TouchableOpacity style={[mobileStyles.primaryBtn, loading && { opacity: 0.7 }]} onPress={handleNext} disabled={loading}>
        <Text style={mobileStyles.primaryBtnTxt}>SIGUIENTE</Text>
      </TouchableOpacity>

      <View style={mobileStyles.separatorRow}>
        <View style={mobileStyles.separatorLine} />
        <View style={mobileStyles.separatorDot} />
        <View style={mobileStyles.separatorLine} />
      </View>

      <TouchableOpacity style={[mobileStyles.googleBtn, googleLoading && { opacity: 0.7 }]} onPress={handleLoginGoogle} disabled={googleLoading}>
        {googleLoading ? <ActivityIndicator color="#000" /> : (
          <>
            <Image source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }} style={{ width: 18, height: 18 }} />
            <Text style={mobileStyles.googleBtnTxt}>CONTINUAR CON GOOGLE</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={mobileStyles.bottomRow}>
        <Text style={mobileStyles.bottomTxt}>¿Ya tienes cuenta? </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Ingreso')}>
          <Text style={mobileStyles.bottomLink}>Inicia sesión</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderMobileProfileStep = () => (
    <View style={mobileStyles.formContent}>
      <View style={[mobileStyles.badge, { backgroundColor: '#E50914' }]}>
        <Text style={mobileStyles.badgeText}>¡CASI LISTO!</Text>
      </View>
      <View style={mobileStyles.titleRow}>
        <Text style={mobileStyles.titleBlack}>Tu </Text>
      </View>
      <Text style={mobileStyles.titleRed}>perfil</Text>
      <Text style={mobileStyles.subtitle}>Crea tu perfil y personaliza tu experiencia</Text>

      {/* Step Indicator */}
      <View style={mobileStyles.stepRow}>
        <View style={mobileStyles.stepCircleCompleted}><Ionicons name="checkmark" size={14} color="#fff" /></View>
        <View style={mobileStyles.stepLineActive} />
        <View style={mobileStyles.stepCircleActive}><Text style={mobileStyles.stepNumActive}>2</Text></View>
        <Text style={mobileStyles.stepLabel}>Paso 2 de 2</Text>
      </View>

      <Text style={[mobileStyles.fieldLabel, { marginTop: 10 }]}>
        FOTO DE PERFIL <Text style={{ color: '#E50914' }}>(OBLIGATORIA)</Text>
      </Text>
      <View style={mobileStyles.avatarRow}>
        <TouchableOpacity
          style={mobileStyles.avatarPicker}
          onPress={handleSelectProfileImage}
          disabled={loading || uploadingImage}
        >
          {selectedImageUri ? (
            <Image source={{ uri: selectedImageUri }} style={mobileStyles.avatarPreview} />
          ) : (
            <View style={mobileStyles.avatarPlaceholder}>
              {uploadingImage ? (
                <ActivityIndicator size="small" color="#E50914" />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={26} color="#ccc" />
                  <Text style={mobileStyles.avatarPlaceholderText}>Subir</Text>
                </>
              )}
            </View>
          )}
        </TouchableOpacity>
        <View style={mobileStyles.avatarMeta}>
          <Text style={mobileStyles.avatarMetaText}>JPG, PNG o GIF</Text>
          <Text style={mobileStyles.avatarMetaText}>Máx. 5MB</Text>
        </View>
      </View>
      {errors.avatar && <Text style={mobileStyles.errorText}>{errors.avatar}</Text>}

      <Text style={mobileStyles.fieldLabel}>NOMBRE DEL PERFIL</Text>
      <View style={mobileStyles.inputWrap}>
        <TextInput
          style={[mobileStyles.input, focusedInput === 'profileName' && mobileStyles.inputFocused, errors.profileName && mobileStyles.inputError]}
          placeholder="¿Cómo te llamamos?"
          placeholderTextColor="#bbb"
          value={profileName}
          onChangeText={(t) => { setProfileName(t); clearError('profileName'); }}
          autoCapitalize="words"
          editable={!loading}
          onFocus={() => setFocusedInput('profileName')}
          onBlur={() => setFocusedInput(null)}
        />
      </View>
      {errors.profileName && <Text style={mobileStyles.errorText}>{errors.profileName}</Text>}

      <TouchableOpacity 
        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginTop: 10, paddingRight: 20 }}
        onPress={() => { setLegalConsent(!legalConsent); clearError('legal'); }}
      >
        <View style={{ width: 22, height: 22, borderWidth: 2, borderColor: legalConsent ? '#E50914' : '#ccc', borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginRight: 10, backgroundColor: legalConsent ? '#E50914' : 'transparent' }}>
          {legalConsent && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <Text style={{ color: '#121212', fontSize: 13, flex: 1 }}>
          He leído y acepto los <Text style={{ textDecorationLine: 'underline', color: '#E50914' }} onPress={(e) => { e.stopPropagation(); navigation.navigate('LegalScreen', { type: 'terms' }); }}>Términos</Text> y la <Text style={{ textDecorationLine: 'underline', color: '#E50914' }} onPress={(e) => { e.stopPropagation(); navigation.navigate('LegalScreen', { type: 'privacy' }); }}>Política de Privacidad</Text>
        </Text>
      </TouchableOpacity>
      {errors.legal && <Text style={[mobileStyles.errorText, { marginTop: -15, marginBottom: 15 }]}>{errors.legal}</Text>}

      <View style={mobileStyles.buttonRow}>
        <TouchableOpacity style={mobileStyles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={16} color="#111" />
          <Text style={mobileStyles.backButtonText}>ATRÁS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[mobileStyles.createAccountBtn, (loading || uploadingImage) && { opacity: 0.7 }]}
          onPress={handleRegister}
          disabled={loading || uploadingImage}
        >
          {loading || uploadingImage ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={mobileStyles.createAccountBtnTxt}>CREAR CUENTA</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={webStyles.container}>
        {/* ═══ LEFT PANEL — Animated 3D background ═══ */}
        <AnimatedLeftPanel />

        {/* Diagonal Background (White wedge + Red line) */}
        <View style={webStyles.diagonalBackground} />

        <View style={webStyles.rightPanel}>
          <View style={webStyles.decorBoxTopRight}>
            <View style={webStyles.decorSquareInner} />
          </View>
          <View style={webStyles.decorDotsContainer}>
            {[0, 1, 2, 3].map(row => (
              <View key={row} style={webStyles.decorDotRow}>
                {[0, 1, 2, 3].map(col => (
                  <View key={col} style={[webStyles.decorDot, (row + col) % 2 === 0 && webStyles.decorDotActive]} />
                ))}
              </View>
            ))}
          </View>
          <ScrollView contentContainerStyle={webStyles.scrollContent} showsVerticalScrollIndicator={false}>
            {currentStep === 'email' ? renderWebEmailStep() : renderWebProfileStep()}
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={mobileStyles.container}
    >
      <ScrollView
        contentContainerStyle={mobileStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {/* ═══ TOP HERO SECTION (Black) ═══ */}
        <View style={mobileStyles.topHero}>
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

          {currentStep === 'email' ? renderMobileEmailStep() : renderMobileProfileStep()}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// WEB STYLES
// ═══════════════════════════════════════════════════════════════════════════
const webStyles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#000', position: 'relative' },
  leftPanel: { flex: 1, backgroundColor: '#0a0a0a', position: 'relative', overflow: 'hidden' },
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
  particle: { position: 'absolute', backgroundColor: '#E50914', borderRadius: 2 },
  particleOut: { position: 'absolute', backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(229, 9, 20, 0.4)', borderRadius: 2 },
  pSm: { width: 8, height: 8 },
  pMd: { width: 13, height: 13 },
  topLogo: { position: 'absolute', top: 28, left: 32, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 5 },
  logoIconBox: { width: 28, height: 28, backgroundColor: '#E50914', borderRadius: 0, justifyContent: 'center', alignItems: 'center' },
  logoText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 1.5 },
  geomAccent1: { position: 'absolute', bottom: 0, right: -80, width: 480, height: 420, backgroundColor: 'rgba(120, 0, 0, 0.35)', transform: [{ skewX: '15deg' }] },
  geomAccent2: { position: 'absolute', bottom: 0, right: 60, width: 260, height: 260, backgroundColor: 'rgba(229, 9, 20, 0.10)', transform: [{ skewX: '15deg' }] },
  brandingBlock: { position: 'absolute', bottom: 72, left: 40, zIndex: 5 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  accentBar: { width: 3, height: 16, backgroundColor: '#E50914' },
  subtitleText: { color: '#E50914', fontSize: 12, fontWeight: '600', letterSpacing: 3 },
  heroWhite: { color: '#fff', fontSize: 67, fontWeight: '900', letterSpacing: -1, lineHeight: 70 },
  heroRed: { color: '#E50914', fontSize: 67, fontWeight: '900', letterSpacing: -1, lineHeight: 70 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 28, gap: 16 },
  statItem: { alignItems: 'center' },
  statIcon: { width: 28, height: 28, borderRadius: 0, borderWidth: 1, borderColor: 'rgba(229, 9, 20, 0.4)', justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  statVal: { color: '#fff', fontSize: 14, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 38, backgroundColor: 'rgba(255,255,255,0.1)' },
  rightPanel: { width: 500, backgroundColor: 'transparent', position: 'relative', overflow: 'hidden', zIndex: 20 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 75, paddingVertical: 40 },
  decorBoxTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 121,
    height: 121,
    backgroundColor: 'rgba(229, 9, 20, 0.07)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  decorSquareInner: {
    width: 61,
    height: 61,
    borderWidth: 3,
    borderColor: 'rgba(229, 9, 20, 0.26)',
  },
  decorDotsContainer: { position: 'absolute', bottom: 30, left: 80, gap: 6, zIndex: 2 },
  decorDotRow: { flexDirection: 'row', gap: 6 },
  decorDot: { width: 8, height: 8, borderRadius: 2, backgroundColor: 'rgba(229, 9, 20, 0.1)' },
  decorDotActive: { backgroundColor: 'rgba(229, 9, 20, 0.35)' },
  formWrapper: { width: '100%' },
  badge: { alignSelf: 'flex-start', backgroundColor: '#121212', borderWidth: 1.6, borderColor: '#121212', borderRadius: 0, paddingHorizontal: 13, paddingVertical: 5, marginBottom: 17 },
  badgeText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 1.3 },
  formTitle: { color: '#121212', fontSize: 35, fontWeight: '900', lineHeight: 35 },
  formTitleRed: { color: '#E50914', fontSize: 35, fontWeight: '900', lineHeight: 35, marginBottom: 9 },
  formSubtitle: { color: '#010101', fontSize: 15, marginBottom: 23, opacity: 0.6 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 21 },
  stepCircle: { width: 29, height: 29, borderRadius: 0, borderWidth: 1.6, borderColor: '#dee', justifyContent: 'center', alignItems: 'center' },
  stepCircleActive: { width: 29, height: 29, borderRadius: 0, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' },
  stepCircleCompleted: { width: 29, height: 29, borderRadius: 0, backgroundColor: '#E50914', justifyContent: 'center', alignItems: 'center' },
  stepNum: { color: '#bcc', fontSize: 14, fontWeight: '700' },
  stepNumActive: { color: '#fff', fontSize: 14, fontWeight: '700' },
  stepLine: { width: 31, height: 3, backgroundColor: '#dee' },
  stepLineActive: { width: 31, height: 3, backgroundColor: '#E50914' },
  stepLabel: { color: '#aaa', fontSize: 14, marginLeft: 5 },
  fieldLabel: { color: '#121212', fontSize: 14, fontWeight: '700', letterSpacing: 0.9, marginBottom: 7, marginTop: 5 },
  inputContainer: { position: 'relative', marginBottom: 15 },
  input: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#e1e1e1', borderRadius: 0, paddingHorizontal: 15, paddingVertical: 13, fontSize: 17, color: '#121212' },
  inputFocused: { borderColor: '#E50914', backgroundColor: '#fff' },
  inputError: { borderColor: '#E50914' },
  eyeIcon: { position: 'absolute', right: 15, top: 14 },
  errorText: { color: '#E50914', fontSize: 14, marginTop: -7, marginBottom: 11 },
  primaryButton: { backgroundColor: '#E50914', borderRadius: 0, paddingVertical: 15, alignItems: 'center', marginBottom: 21, marginTop: 5 },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 1.6 },
  separatorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 21, gap: 9 },
  separatorLine: { flex: 1, height: 2, backgroundColor: '#f1f1f1' },
  separatorText: { color: '#ddd', fontSize: 14, fontWeight: '600' },
  googleButton: { borderWidth: 1.6, borderColor: '#333', borderRadius: 0, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 11, marginBottom: 21 },
  googleG: { color: '#121212', fontSize: 19, fontWeight: '800' },
  googleButtonText: { color: '#121212', fontSize: 15, fontWeight: '700', letterSpacing: 0.9 },
  bottomLink: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  bottomLinkText: { color: '#999', fontSize: 15 },
  bottomLinkBold: { color: '#121212', fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
  avatarPicker: { width: 121, height: 121, borderRadius: 61, borderWidth: 3, borderColor: '#eee', borderStyle: 'dashed', alignSelf: 'center', marginBottom: 21, overflow: 'hidden' },
  avatarPreview: { width: '100%', height: '100%', borderRadius: 61 },
  avatarPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fafafa' },
  avatarPlaceholderText: { color: '#ccc', fontSize: 14, marginTop: 7 },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 5 },
  backButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 2, borderColor: '#e1e1e1', borderRadius: 0, paddingHorizontal: 20, paddingVertical: 13 },
  backButtonText: { color: '#666', fontSize: 16, fontWeight: '700' },
});

// ═══════════════════════════════════════════════════════════════════════════
// MOBILE STYLES
// ═══════════════════════════════════════════════════════════════════════════
const mobileStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scrollContent: { flexGrow: 1, minHeight: '100%' },
  
  // ── TOP HERO (Black) ──
  topHero: {
    height: 320,
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
    marginTop: 20, // Negative overlap handled by diagonal cut
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
    paddingTop: 40,
    paddingBottom: 40,
    zIndex: 10,
  },
  badge: { alignSelf: 'flex-start', backgroundColor: '#000', paddingHorizontal: 10, paddingVertical: 4, marginBottom: 16 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  titleRow: { flexDirection: 'row' },
  titleBlack: { color: '#111', fontSize: 28, fontWeight: '900', lineHeight: 30 },
  titleRed: { color: '#E50914', fontSize: 28, fontWeight: '900', lineHeight: 30, marginBottom: 6 },
  subtitle: { color: '#777', fontSize: 13, marginBottom: 24 },
  
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  stepCircle: { width: 28, height: 28, borderWidth: 1.5, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
  stepCircleActive: { width: 28, height: 28, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  stepCircleCompleted: { width: 28, height: 28, backgroundColor: '#E50914', justifyContent: 'center', alignItems: 'center' },
  stepNum: { color: '#999', fontSize: 12, fontWeight: '700' },
  stepNumActive: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepLine: { width: 30, height: 2, backgroundColor: '#eee' },
  stepLineActive: { width: 30, height: 2, backgroundColor: '#E50914' },
  stepLabel: { color: '#aaa', fontSize: 13, marginLeft: 6 },

  fieldLabel: { color: '#111', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111', marginBottom: 6, backgroundColor: '#fff' },
  inputFocused: { borderColor: '#E50914' },
  inputError: { borderColor: '#E50914' },
  inputWrap: { position: 'relative', marginBottom: 10 },
  eyeBtn: { position: 'absolute', right: 14, top: 12 },
  errorText: { color: '#E50914', fontSize: 12, marginBottom: 10 },
  
  primaryBtn: { backgroundColor: '#E50914', paddingVertical: 14, alignItems: 'center', marginBottom: 20, marginTop: 10 },
  primaryBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 1.5 },
  
  separatorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  separatorDot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff' },
  
  googleBtn: { borderWidth: 1, borderColor: '#000', paddingVertical: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 30 },
  googleBtnTxt: { color: '#000', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  
  bottomRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  bottomTxt: { color: '#888', fontSize: 13 },
  bottomLink: { color: '#111', fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },

  // Avatar styles
  avatarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  avatarPicker: { width: 80, height: 80, borderWidth: 2, borderColor: '#ccc', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  avatarPreview: { width: '100%', height: '100%' },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholderText: { color: '#bbb', fontSize: 11, marginTop: 4 },
  avatarMeta: { marginLeft: 15, gap: 4 },
  avatarMetaText: { color: '#888', fontSize: 12 },

  // Step 2 buttons
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 15 },
  backButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 2, borderColor: '#111', paddingHorizontal: 16, paddingVertical: 14 },
  backButtonText: { color: '#111', fontSize: 14, fontWeight: '800' },
  createAccountBtn: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  createAccountBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
});

export default RegisterScreen;
