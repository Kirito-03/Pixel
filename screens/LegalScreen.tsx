import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

export default function LegalScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const { type } = route.params || { type: 'privacy' };

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (type === 'privacy') {
      setTitle('Política de Privacidad');
      setContent(`
**Última actualización:** Agosto 2026

**1. Recopilación de Datos**
Recopilamos información que nos proporcionas directamente al crear una cuenta, como tu correo electrónico y nombre de perfil. También recopilamos datos sobre tu uso de la aplicación para mejorar tu experiencia (ver Política de Cookies/Rastreo).

**2. Uso de la Información**
Utilizamos tus datos para:
- Mantener y mejorar la plataforma.
- Sincronizar tu progreso de visualización y listas a través de dispositivos.
- Personalizar tu experiencia en Pixel no Sekai.

**3. Protección de Datos**
Implementamos medidas de seguridad estándar de la industria (como cifrado de contraseñas con bcrypt) para proteger tu información. No vendemos tus datos a terceros.

**4. Derechos del Usuario**
Puedes solicitar la eliminación de tu cuenta y todos los datos asociados en cualquier momento contactando a nuestro soporte o mediante la opción en el panel de usuario si está disponible.
      `);
    } else {
      setTitle('Términos y Condiciones');
      setContent(`
**Última actualización:** Agosto 2026

**1. Aceptación de los Términos**
Al acceder y usar Pixel no Sekai, aceptas estar sujeto a estos términos. Si no estás de acuerdo, por favor no uses la aplicación.

**2. Uso del Servicio**
- El contenido disponible es para tu uso personal y no comercial.
- Las funciones de descarga offline están restringidas al uso personal dentro de la app.

**3. Contenido para Adultos (+18)**
- Algunos contenidos pueden estar clasificados como +18.
- Al habilitar el contenido para adultos en la configuración del perfil, certificas que cumples con la edad legal requerida en tu jurisdicción.

**4. Modificaciones del Servicio**
Nos reservamos el derecho de modificar o discontinuar el servicio (o cualquier parte del mismo) temporal o permanentemente con o sin previo aviso.
      `);
    }
  }, [type]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {content.split('\\n\\n').map((paragraph, index) => (
          <Text key={index} style={[styles.paragraph, { color: colors.text }]}>
            {paragraph.replace(/\\*\\*/g, '')}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'android' ? 16 : 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 16,
    opacity: 0.9,
  },
});
