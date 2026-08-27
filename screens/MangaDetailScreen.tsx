import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import Header from '../components/Header';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { useMyList } from '../contexts/MyListContext';
import { mangaApi, Manga, MangaChapter } from '../services/mangaApi';

function formatDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fallbackDescription(title?: string | null) {
  const t = String(title || '').trim();
  return t ? `Lee ${t} en Pixel no Sekai.` : 'Descripción no disponible.';
}

export default function MangaDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { navigateByLabel } = useTabNavigation();
  const { isInMyList, toggleMyList } = useMyList();
  const id = String(route?.params?.id || '').trim();
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;

  const [loading, setLoading] = useState(true);
  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<MangaChapter[]>([]);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [totalAvailableChapters, setTotalAvailableChapters] = useState(0);
  const [spanishAvailableChapters, setSpanishAvailableChapters] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>('es');
  const [usedFallbackToEnglish, setUsedFallbackToEnglish] = useState(false);
  const [languageNotice, setLanguageNotice] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<'es' | 'es-la' | 'en'>('es');
  const [allowEnglishFallback, setAllowEnglishFallback] = useState(true);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [m, c] = await Promise.all([
          mangaApi.getById(id),
          mangaApi.chapters(id, {
            limit: 300,
            preferredLanguage,
            allowEnglishFallback,
          }),
        ]);
        if (cancelled) return;
        setManga(m);
        setChapters(c.chapters || c.items || []);
        setAvailableLanguages(Array.isArray(c.availableLanguages) ? c.availableLanguages : []);
        setTotalAvailableChapters(Number(c.totalAvailableChapters || 0));
        setSpanishAvailableChapters(Number(c.spanishAvailableChapters || 0));
        setSelectedLanguage(c.selectedLanguage || preferredLanguage);
        setUsedFallbackToEnglish(c.usedFallbackToEnglish === true);
        const notice = c.noSpanishMessage
          ? c.noSpanishMessage
          : (c.usedFallbackToEnglish ? 'Mostrando capítulos en inglés por falta de traducción en español' : '');
        setLanguageNotice(notice);
        setImageError(false);
      } catch {
        if (cancelled) return;
        setManga(null);
        setChapters([]);
        setAvailableLanguages([]);
        setTotalAvailableChapters(0);
        setSpanishAvailableChapters(0);
        setSelectedLanguage(preferredLanguage);
        setUsedFallbackToEnglish(false);
        setLanguageNotice('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (id) run();
    return () => {
      cancelled = true;
    };
  }, [id, preferredLanguage, allowEnglishFallback]);

  const tags = useMemo(() => {
    const t = manga?.tags || [];
    return t.slice(0, 12);
  }, [manga?.tags]);

  const openChapter = async (chapter: MangaChapter, index: number) => {
    navigation.navigate('MangaReader', {
      id,
      mangaId: id,
      chapterId: encodeURIComponent(chapter.id),
      chapters,
      currentIndex: index,
      mangaTitle: manga?.title || 'Manga',
    });
  };

  const updatedText = manga?.updated_at ? formatDate(manga.updated_at) : '';

  return (
    <View style={styles.container}>
      <Header
        black
        activeSection="Manga"
        onNavPress={navigateByLabel}
        onSearchPress={() => navigateByLabel('Buscar')}
        onProfilePress={() => navigateByLabel('Perfil')}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#E50914" />
          </View>
        ) : !manga ? (
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={46} color="rgba(255,255,255,0.18)" />
            <Text style={styles.emptyTitle}>Manga no disponible</Text>
          </View>
        ) : (
          <View style={styles.contentWrap}>
            {/* Background Blur */}
            <View style={styles.backdropImageContainer}>
              {manga.cover_url && !imageError ? (
                <Image
                  source={{ uri: manga.cover_url }}
                  style={styles.backdropImage}
                  blurRadius={Platform.OS === 'web' ? 10 : 5}
                  onError={() => setImageError(true)}
                  resizeMode="cover"
                />
              ) : null}
              <View style={styles.backdropOverlay} />
              <LinearGradient
                colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.8)', '#0B0B0B', '#0B0B0B']}
                locations={[0, 0.4, 0.7, 1]}
                style={StyleSheet.absoluteFillObject}
              />
            </View>
            
            <SafeAreaView edges={['top', 'left', 'right']}>
              <View style={styles.topBar}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.9}>
                  <Ionicons name="arrow-back" size={20} color="#fff" />
                  <Text style={styles.backText}>Volver</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>

            <View style={[styles.heroContent, isSmallScreen ? styles.heroContentMobile : styles.heroContentWeb]}>
              <View style={[styles.posterContainer, isSmallScreen ? styles.posterMobile : styles.posterWeb]}>
                {manga.cover_url && !imageError ? (
                  <Image source={{ uri: manga.cover_url }} style={styles.posterImage} resizeMode="cover" />
                ) : (
                  <View style={styles.posterFallback}>
                    <Ionicons name="image-outline" size={40} color="rgba(255,255,255,0.2)" />
                  </View>
                )}
              </View>

              <View style={[styles.infoContainer, isSmallScreen && styles.infoMobile]}>
                <Text style={styles.title}>{manga.title}</Text>
                
                <View style={styles.metaRow}>
                  {manga.status ? (
                    <Text style={styles.metaText}>{String(manga.status).toUpperCase()}</Text>
                  ) : null}
                  {manga.year ? (
                    <>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.metaText}>{manga.year}</Text>
                    </>
                  ) : null}
                  {updatedText ? (
                    <>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.metaText}>Act. {updatedText}</Text>
                    </>
                  ) : null}
                </View>

                {tags.length > 0 && (
                  <View style={styles.tagsContainer}>
                    {tags.map((t, idx) => (
                      <View key={idx} style={styles.tag}>
                        <Text style={styles.tagText}>{t}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={styles.excerpt}>{manga.description || fallbackDescription(manga.title)}</Text>

                <View style={styles.actions}>
                  <TouchableOpacity
                    onPress={() => {
                      if (!chapters.length) return;
                      openChapter(chapters[0], 0);
                    }}
                    style={[styles.primaryBtn, !chapters.length && styles.btnDisabled]}
                    activeOpacity={0.9}
                    disabled={!chapters.length}
                  >
                    <Ionicons name="play" size={18} color="#000" />
                    <Text style={styles.primaryText}>Leer ahora</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.secondaryBtn} 
                    onPress={() => toggleMyList(id, 'manga')}
                  >
                    <Ionicons name={isInMyList(id, 'manga') ? "checkmark" : "add"} size={20} color="#fff" />
                    <Text style={styles.secondaryText}>Mi lista</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtn}>
                    <Ionicons name="heart-outline" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={[styles.chaptersSection, isSmallScreen ? styles.chaptersSectionMobile : styles.chaptersSectionWeb]}>
              <View style={styles.chaptersHeader}>
                <Text style={styles.sectionTitle}>Capítulos</Text>
                
                <View style={styles.languageControls}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setPreferredLanguage('es')}
                    style={[styles.langChip, preferredLanguage === 'es' && styles.langChipActive]}
                  >
                    <Text style={[styles.langChipText, preferredLanguage === 'es' && styles.langChipTextActive]}>ES</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setPreferredLanguage('en')}
                    style={[styles.langChip, preferredLanguage === 'en' && styles.langChipActive]}
                  >
                    <Text style={[styles.langChipText, preferredLanguage === 'en' && styles.langChipTextActive]}>EN</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {languageNotice ? (
                <Text style={styles.availabilityNote}>{languageNotice}</Text>
              ) : null}

              <View style={styles.chaptersList}>
                {chapters.length === 0 ? (
                  <Text style={styles.noChaptersText}>No hay capítulos disponibles.</Text>
                ) : (
                  chapters.map((chap, idx) => (
                    <TouchableOpacity
                      key={chap.id}
                      style={styles.chapterCard}
                      activeOpacity={0.8}
                      onPress={() => openChapter(chap, idx)}
                    >
                      <View style={styles.chapterNumber}>
                        <Text style={styles.chapterNumberText}>{chap.chapter}</Text>
                      </View>
                      <View style={styles.chapterInfo}>
                        <Text style={styles.chapterCardTitle} numberOfLines={1}>
                          {chap.title || `Capítulo ${chap.chapter}`}
                        </Text>
                        <Text style={styles.chapterDate}>
                          {chap.publishAt ? formatDate(chap.publishAt) : 'Sin fecha'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0B' },
  scroll: { flexGrow: 1, paddingBottom: 60 },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 90 : 10,
    paddingBottom: 5,
    zIndex: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  backText: { color: '#fff', fontSize: 14, fontWeight: '600', marginLeft: 6 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100, gap: 12 },
  emptyTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '600' },
  
  contentWrap: {
    position: 'relative',
    flex: 1,
  },
  backdropImageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 600,
    zIndex: 0,
  },
  backdropImage: {
    width: '100%',
    height: '100%',
    opacity: 0.6,
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  heroContent: {
    paddingTop: 40,
    paddingHorizontal: 20,
    zIndex: 1,
  },
  heroContentWeb: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    maxWidth: 1100,
    alignSelf: 'center',
    width: '100%',
  },
  heroContentMobile: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  posterContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  posterWeb: {
    width: 240,
    height: 360,
    marginRight: 40,
    flexShrink: 0,
  },
  posterMobile: {
    width: 180,
    height: 270,
    marginBottom: 24,
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContainer: {
    flex: 1,
  },
  infoMobile: {
    alignItems: 'center',
    textAlign: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  metaText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  metaDot: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    marginHorizontal: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  tagText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  excerpt: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 24,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 6,
    gap: 8,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  primaryText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(60,60,60,0.85)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    gap: 8,
  },
  secondaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  iconBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    width: 44,
    height: 44,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  
  chaptersSection: {
    marginTop: 40,
    paddingHorizontal: 20,
    zIndex: 1,
  },
  chaptersSectionWeb: {
    maxWidth: 1100,
    alignSelf: 'center',
    width: '100%',
  },
  chaptersSectionMobile: {
    width: '100%',
  },
  chaptersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  languageControls: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    padding: 2,
  },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  langChipActive: {
    backgroundColor: '#E50914',
  },
  langChipText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
  },
  langChipTextActive: {
    color: '#fff',
  },
  availabilityNote: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  chaptersList: {
    gap: 8,
  },
  noChaptersText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 30,
  },
  chapterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  chapterNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  chapterNumberText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  chapterInfo: {
    flex: 1,
    marginRight: 12,
  },
  chapterCardTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  chapterDate: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
});
