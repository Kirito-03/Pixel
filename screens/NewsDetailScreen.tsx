import { useTheme } from '../contexts/ThemeContext';
import { detailPalette } from '../utils/detailPalette';
import Loader from '../components/Loader';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import Header from '../components/Header';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { newsApi, NewsArticle } from '../services/newsApi';

function summarize(title?: string | null, excerpt?: string | null, content?: string | null) {
  const body = String(excerpt || content || '').replace(/\s+/g, ' ').trim();
  if (body) return body.slice(0, 220);
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  return t ? `${t.slice(0, 180)}...` : 'Sin resumen disponible.';
}

export default function NewsDetailScreen() {
  const { colors } = useTheme();
  const styles = detailPalette(baseStyles, colors, { background: ['container'], text: ['sectionTitle', 'backText', 'emptyTitle'], secondary: ['contentText'], surface: ['backBtn'] });
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { navigateByLabel } = useTabNavigation();
  const slug = String(route?.params?.slug || '').trim();

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<NewsArticle | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const data = await newsApi.getBySlug(slug);
        if (!cancelled) {
          setItem(data);
          setImageError(false);
        }
      } catch {
        if (!cancelled) setItem(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (slug) run();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const openExternal = async () => {
    const url = item?.external_url;
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch { }
  };

  const dateText = item?.published_at ? new Date(item.published_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <View style={styles.container}>
      <Header
        black
        activeSection="Noticias"
        onNavPress={navigateByLabel}
        onSearchPress={() => navigateByLabel('Buscar')}
        onProfilePress={() => navigateByLabel('Perfil')}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SafeAreaView>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.9}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
              <Text style={styles.backText}>Volver</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {loading ? (
          <View style={styles.loading}>
            <Loader />
          </View>
        ) : !item ? (
          <View style={styles.empty}>
            <Ionicons name="newspaper-outline" size={46} color="rgba(255,255,255,0.18)" />
            <Text style={styles.emptyTitle}>Noticia no disponible</Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              {item.image_url && !imageError ? (
                <Image
                  source={{ uri: item.image_url }}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode="cover"
                  onError={() => setImageError(true)}
                />
              ) : (
                <View style={[StyleSheet.absoluteFillObject, styles.imageFallback]}>
                  <LinearGradient
                    colors={['#191919', '#111111', '#0A0A0A']}
                    locations={[0, 0.62, 1]}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <Text style={styles.imageFallbackText}>PIXEL NO SEKAI NEWS</Text>
                  {item.category ? (
                    <View style={styles.imageFallbackBadge}>
                      <Text style={styles.imageFallbackBadgeText}>{String(item.category).toUpperCase()}</Text>
                    </View>
                  ) : null}
                </View>
              )}
              <LinearGradient
                colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.95)']}
                locations={[0, 0.55, 1]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.heroContent}>
                <View style={styles.metaRow}>
                  {item.category ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{String(item.category).toUpperCase()}</Text>
                    </View>
                  ) : null}
                  {dateText ? (
                    <View style={styles.dateRow}>
                      <Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.6)" />
                      <Text style={styles.dateText}>{dateText}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.excerpt}>{summarize(item.title, item.excerpt, item.content)}</Text>
                <View style={styles.actions}>
                  <TouchableOpacity onPress={openExternal} style={styles.primaryBtn} activeOpacity={0.9} disabled={!item.external_url}>
                    <Ionicons name="open-outline" size={18} color="#000" />
                    <Text style={styles.primaryText}>Leer original</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.body}>
              <Text style={styles.sectionTitle}>Detalle</Text>
              <Text style={styles.contentText}>
                {item.content || summarize(item.title, item.excerpt, item.content)}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: { paddingTop: 80, paddingBottom: 40 },
  topBar: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  backText: { color: 'rgba(255,255,255,0.9)', fontWeight: '800' },
  loading: { paddingTop: 40, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingTop: 40, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  hero: { marginHorizontal: 20, borderRadius: 16, overflow: 'hidden', height: 360, backgroundColor: '#111' },
  heroContent: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  badge: { backgroundColor: 'rgba(229,9,20,0.22)', borderWidth: 1, borderColor: 'rgba(229,9,20,0.35)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700' },
  title: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.4, lineHeight: 34, marginBottom: 10 },
  excerpt: { color: 'rgba(255,255,255,0.68)', fontSize: 14, lineHeight: 20, marginBottom: 14, maxWidth: 700 },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  primaryText: { color: '#000', fontWeight: '900' },
  body: { paddingHorizontal: 20, paddingTop: 22 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 10 },
  contentText: { color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 22 },
  imageFallback: {
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '900',
  },
  imageFallbackBadge: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  imageFallbackBadgeText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
});
