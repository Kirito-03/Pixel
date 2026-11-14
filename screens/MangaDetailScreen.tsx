import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import Header from '../components/Header';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { useMyList } from '../contexts/MyListContext';
import { mangaApi, Manga, MangaChapter } from '../services/mangaApi';

const MAX_DETAIL_WIDTH = 1080;

function formatDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fallbackDescription(title?: string | null) {
  const t = String(title || '').trim();
  return t ? `Lee ${t} en Pixel no Sekai.` : 'Descripción no disponible.';
}

export default function MangaDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { navigateByLabel } = useTabNavigation();
  const {
    isInMyList,
    toggleMyList,
    isUpdatingMyList,
    loading: listLoading,
  } = useMyList();
  const id = String(route?.params?.id || '').trim();
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [localSavingList, setSavingList] = useState(false);
  const savingList =
    localSavingList || listLoading || isUpdatingMyList(id, 'manga');
  const [listError, setListError] = useState('');
  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<MangaChapter[]>([]);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [totalAvailableChapters, setTotalAvailableChapters] = useState(0);
  const [spanishAvailableChapters, setSpanishAvailableChapters] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>('es');
  const [usedFallbackToEnglish, setUsedFallbackToEnglish] = useState(false);
  const [languageNotice, setLanguageNotice] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<
    'es' | 'es-la' | 'en'
  >('es');
  const [allowEnglishFallback] = useState(true);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setLoadError(null);
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
        setAvailableLanguages(
          Array.isArray(c.availableLanguages) ? c.availableLanguages : []
        );
        setTotalAvailableChapters(Number(c.totalAvailableChapters || 0));
        setSpanishAvailableChapters(Number(c.spanishAvailableChapters || 0));
        setSelectedLanguage(c.selectedLanguage || preferredLanguage);
        setUsedFallbackToEnglish(c.usedFallbackToEnglish === true);
        const showingEnglishFallback =
          preferredLanguage !== 'en' && c.selectedLanguage === 'en';
        const notice =
          c.usedFallbackToEnglish || showingEnglishFallback
            ? 'Sin capítulos en español: mostrando los disponibles en inglés.'
            : c.noSpanishMessage || '';
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
        setLoadError('No pudimos cargar la ficha del manga. Verifica tu conexión e inténtalo de nuevo.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (id) {
      run();
    } else {
      setLoading(false);
      setManga(null);
    }
    return () => {
      cancelled = true;
    };
  }, [id, preferredLanguage, allowEnglishFallback, reloadKey]);

  const tags = useMemo(() => {
    const t = manga?.tags || [];
    return t.slice(0, 12);
  }, [manga?.tags]);

  const openChapter = async (chapter: MangaChapter, _index?: number) => {
    const lang = selectedLanguage || preferredLanguage || 'es';
    navigation.navigate('MangaReader', {
      id,
      mangaId: id,
      chapterId: encodeURIComponent(chapter.id),
      language: lang,
      selectedLanguage: lang,
      mangaTitle: manga?.title || 'Manga',
    });
  };

  const updatedText = manga?.updated_at ? formatDate(manga.updated_at) : '';
  const inMyList = isInMyList(id, 'manga');
  const chapterCountText =
    chapters.length > 0
      ? `${chapters.length} ${chapters.length === 1 ? 'capítulo' : 'capítulos'}`
      : totalAvailableChapters > 0
        ? `${totalAvailableChapters} disponibles`
        : '';

  return (
    <View style={styles.container}>
      <Header
        black
        activeSection="Manga"
        onNavPress={navigateByLabel}
        onSearchPress={() => navigateByLabel('Buscar')}
        onProfilePress={() => navigateByLabel('Perfil')}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <SafeAreaView edges={['top', 'left', 'right']}>
          <View style={styles.pageContainer}>
            {/* ── BARRA SUPERIOR ── */}
            <View style={styles.topBar}>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.backBtn}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Volver al catálogo de manga"
              >
                <Ionicons name="arrow-back" size={18} color="#fff" />
                <Text style={styles.backText}>Volver</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color="#E50914" />
              </View>
            ) : loadError ? (
              <View style={styles.stateCard}>
                <Ionicons
                  name="alert-circle-outline"
                  size={42}
                  color="#E50914"
                />
                <Text style={styles.stateTitle}>Error al cargar la ficha</Text>
                <Text style={styles.stateText}>{loadError}</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.retryBtn}
                  onPress={() => setReloadKey((k) => k + 1)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.retryBtnText}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            ) : !manga ? (
              <View style={styles.stateCard}>
                <Ionicons
                  name="book-outline"
                  size={42}
                  color="rgba(255,255,255,0.28)"
                />
                <Text style={styles.stateTitle}>Manga no disponible</Text>
                <Text style={styles.stateText}>
                  No encontramos este título en el catálogo.
                </Text>
              </View>
            ) : (
              <>
                {/* ── FICHA PRINCIPAL (PORTADA + INFO) ── */}
                <View
                  style={[
                    styles.detailCard,
                    isSmallScreen
                      ? styles.detailCardMobile
                      : styles.detailCardWeb,
                  ]}
                >
                  <View
                    style={[
                      styles.posterContainer,
                      isSmallScreen ? styles.posterMobile : styles.posterWeb,
                    ]}
                  >
                    {manga.cover_url && !imageError ? (
                      <Image
                        source={{ uri: manga.cover_url }}
                        style={styles.posterImage}
                        resizeMode="cover"
                        onError={() => setImageError(true)}
                      />
                    ) : (
                      <View style={styles.posterFallback}>
                        <Ionicons
                          name="image-outline"
                          size={38}
                          color="rgba(255,255,255,0.25)"
                        />
                      </View>
                    )}
                  </View>

                  <View
                    style={[
                      styles.infoContainer,
                      isSmallScreen && styles.infoMobile,
                    ]}
                  >
                    <View style={styles.eyebrowRow}>
                      <View style={styles.eyebrowBar} />
                      <Text style={styles.eyebrowText}>MANGA</Text>
                    </View>

                    <Text
                      style={[
                        styles.title,
                        isSmallScreen && styles.titleMobile,
                      ]}
                    >
                      {manga.title}
                    </Text>

                    <View
                      style={[
                        styles.metaRow,
                        isSmallScreen && styles.metaRowMobile,
                      ]}
                    >
                      {manga.status ? (
                        <View style={styles.statusPill}>
                          <Text style={styles.statusPillText}>
                            {String(manga.status).toUpperCase()}
                          </Text>
                        </View>
                      ) : null}
                      {manga.year ? (
                        <Text style={styles.metaText}>{manga.year}</Text>
                      ) : null}
                      {manga.author ? (
                        <Text style={styles.metaText}>
                          • {manga.author}
                        </Text>
                      ) : null}
                      {updatedText ? (
                        <Text style={styles.metaText}>
                          • Act. {updatedText}
                        </Text>
                      ) : null}
                    </View>

                    {tags.length > 0 && (
                      <View
                        style={[
                          styles.tagsContainer,
                          isSmallScreen && styles.tagsMobile,
                        ]}
                      >
                        {tags.map((t, idx) => (
                          <View key={`${t}-${idx}`} style={styles.tag}>
                            <Text style={styles.tagText}>{t}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <Text
                      style={[
                        styles.excerpt,
                        isSmallScreen && styles.excerptMobile,
                      ]}
                    >
                      {manga.description || fallbackDescription(manga.title)}
                    </Text>

                    <View style={styles.actions}>
                      <TouchableOpacity
                        onPress={() => {
                          if (!chapters.length) return;
                          openChapter(chapters[0], 0);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Leer manga"
                        style={[
                          styles.primaryBtn,
                          !chapters.length && styles.btnDisabled,
                        ]}
                        activeOpacity={0.9}
                        disabled={!chapters.length}
                      >
                        <Ionicons name="play" size={18} color="#fff" />
                        <Text style={styles.primaryText}>
                          {chapters.length ? 'Leer ahora' : 'Sin capítulos'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.secondaryBtn,
                          inMyList && styles.secondaryBtnActive,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={
                          inMyList
                            ? 'Quitar manga de Mi Lista'
                            : 'Añadir manga a Mi Lista'
                        }
                        accessibilityState={{
                          busy: savingList,
                          disabled: savingList,
                        }}
                        disabled={savingList}
                        activeOpacity={0.85}
                        onPress={async () => {
                          if (savingList) return;
                          setListError('');
                          setSavingList(true);
                          try {
                            await toggleMyList(id, 'manga');
                          } catch (error) {
                            console.error(
                              'Manga Mi Lista:',
                              error instanceof Error
                                ? error.message
                                : 'No se pudo guardar'
                            );
                            setListError(
                              'No se pudo guardar. Comprueba tu sesión y el perfil seleccionado.'
                            );
                          } finally {
                            setSavingList(false);
                          }
                        }}
                      >
                        {savingList ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons
                            name={inMyList ? 'checkmark' : 'add'}
                            size={20}
                            color="#fff"
                          />
                        )}
                        <Text style={styles.secondaryText}>
                          {savingList
                            ? 'Guardando…'
                            : inMyList
                              ? 'En mi lista'
                              : 'Mi lista'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {listError ? (
                      <Text
                        accessibilityRole="alert"
                        style={styles.listErrorText}
                      >
                        {listError}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* ── SECCIÓN DE CAPÍTULOS CLARAMENTE SEPARADA ── */}
                <View style={styles.chaptersSection}>
                  <View style={styles.chaptersHeader}>
                    <View style={styles.chaptersTitleRow}>
                      <View style={styles.sectionBar} />
                      <Text style={styles.sectionTitle}>Capítulos</Text>
                      {chapterCountText ? (
                        <View style={styles.countBadge}>
                          <Text style={styles.countBadgeText}>
                            {chapterCountText}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.languageControls}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Capítulos en español"
                        accessibilityState={{
                          selected:
                            selectedLanguage === 'es' ||
                            selectedLanguage === 'es-la',
                        }}
                        activeOpacity={0.85}
                        onPress={() => setPreferredLanguage('es')}
                        style={[
                          styles.langChip,
                          selectedLanguage?.startsWith('es') &&
                            styles.langChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.langChipText,
                            selectedLanguage?.startsWith('es') &&
                              styles.langChipTextActive,
                          ]}
                        >
                          ES
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Capítulos en inglés"
                        accessibilityState={{
                          selected: selectedLanguage === 'en',
                        }}
                        activeOpacity={0.85}
                        onPress={() => setPreferredLanguage('en')}
                        style={[
                          styles.langChip,
                          selectedLanguage === 'en' && styles.langChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.langChipText,
                            selectedLanguage === 'en' &&
                              styles.langChipTextActive,
                          ]}
                        >
                          EN
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {languageNotice ? (
                    <View style={styles.noticeBox}>
                      <Ionicons
                        name="information-circle-outline"
                        size={16}
                        color="rgba(255,255,255,0.72)"
                      />
                      <Text style={styles.availabilityNote}>
                        {languageNotice}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.chaptersList}>
                    {chapters.length === 0 ? (
                      <View style={styles.noChaptersBox}>
                        <Text style={styles.noChaptersText}>
                          {spanishAvailableChapters === 0 &&
                          usedFallbackToEnglish === false &&
                          availableLanguages.length > 0
                            ? 'No hay capítulos en este idioma.'
                            : 'No hay capítulos disponibles.'}
                        </Text>
                      </View>
                    ) : (
                      chapters.map((chap, idx) => {
                        const chapDate = formatDate(
                          chap.publish_at || chap.readable_at
                        );
                        return (
                          <TouchableOpacity
                            key={chap.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Leer capítulo ${chap.chapter || idx + 1}`}
                            style={[
                              styles.chapterCard,
                              { width: isSmallScreen ? '100%' : '48.8%' },
                            ]}
                            activeOpacity={0.82}
                            onPress={() => openChapter(chap, idx)}
                          >
                            <View style={styles.chapterNumber}>
                              <Text
                                style={styles.chapterNumberText}
                                numberOfLines={1}
                              >
                                {chap.chapter || idx + 1}
                              </Text>
                            </View>
                            <View style={styles.chapterInfo}>
                              <Text
                                style={styles.chapterCardTitle}
                                numberOfLines={1}
                              >
                                {chap.title ||
                                  `Capítulo ${chap.chapter || idx + 1}`}
                              </Text>
                              <Text style={styles.chapterDate} numberOfLines={1}>
                                {chapDate || 'Sin fecha'}
                              </Text>
                            </View>
                            <Ionicons
                              name="chevron-forward"
                              size={18}
                              color="rgba(255,255,255,0.45)"
                            />
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                </View>
              </>
            )}
          </View>
        </SafeAreaView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  scroll: { flexGrow: 1, paddingBottom: 64 },
  pageContainer: {
    width: '100%',
    maxWidth: MAX_DETAIL_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
  },

  topBar: {
    paddingTop: Platform.OS === 'web' ? 88 : 12,
    paddingBottom: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141414',
    alignSelf: 'flex-start',
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 8,
  },
  backText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  loading: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateCard: {
    backgroundColor: '#111111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
    gap: 10,
  },
  stateTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 420,
  },
  retryBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E50914',
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  detailCard: {
    backgroundColor: '#111111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  detailCardWeb: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 24,
    gap: 28,
  },
  detailCardMobile: {
    flexDirection: 'column',
    alignItems: 'center',
    padding: 18,
    gap: 20,
  },

  posterContainer: {
    aspectRatio: 2 / 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexShrink: 0,
  },
  posterWeb: {
    width: 220,
  },
  posterMobile: {
    width: 176,
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
    width: '100%',
  },
  infoMobile: {
    alignItems: 'center',
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  eyebrowBar: {
    width: 16,
    height: 3,
    backgroundColor: '#E50914',
    borderRadius: 2,
  },
  eyebrowText: {
    color: '#E50914',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 10,
  },
  titleMobile: {
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 8,
  },
  metaRowMobile: {
    justifyContent: 'center',
  },
  statusPill: {
    backgroundColor: 'rgba(229,9,20,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusPillText: {
    color: '#ff6b72',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  metaText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '500',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tagsMobile: {
    justifyContent: 'center',
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tagText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
  },
  excerpt: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 22,
    maxWidth: 680,
  },
  excerptMobile: {
    textAlign: 'center',
  },
  actions: {
    maxWidth: 460,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  primaryBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E50914',
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 8,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  primaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1C',
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    gap: 8,
  },
  secondaryBtnActive: {
    borderColor: 'rgba(229,9,20,0.6)',
    backgroundColor: '#1F1112',
  },
  secondaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  listErrorText: {
    color: '#ff9090',
    fontSize: 13,
    marginTop: 12,
  },

  chaptersSection: {
    marginTop: 24,
    backgroundColor: '#111111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
  },
  chaptersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  chaptersTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionBar: {
    width: 3,
    height: 18,
    backgroundColor: '#E50914',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  countBadgeText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
  },
  languageControls: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 4,
  },
  langChip: {
    minHeight: 44,
    minWidth: 52,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langChipActive: {
    backgroundColor: '#E50914',
  },
  langChipText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontWeight: '700',
  },
  langChipTextActive: {
    color: '#fff',
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  availabilityNote: {
    flex: 1,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    lineHeight: 17,
  },
  chaptersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  noChaptersBox: {
    width: '100%',
    paddingVertical: 28,
    alignItems: 'center',
  },
  noChaptersText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    textAlign: 'center',
  },
  chapterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  chapterNumber: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  chapterNumberText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  chapterInfo: {
    flex: 1,
    marginRight: 10,
  },
  chapterCardTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  chapterDate: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
});
