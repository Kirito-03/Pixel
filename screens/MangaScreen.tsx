import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import Header from '../components/Header';
import { MangaCard, MangaRankingItem, MangaFilterChips, MangaFilter, MangaItemUI } from '../components/MangaComponents';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { mangaApi, Manga } from '../services/mangaApi';

export default function MangaScreen() {
  const { colors, theme } = useTheme();
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;
  const navigation = useNavigation<any>();
  const { navigateByLabel } = useTabNavigation();

  const [activeFilter, setActiveFilter] = useState<MangaFilter>('Todos');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Manga[]>([]);
  const [popular, setPopular] = useState<Array<Manga & { rank: number }>>([]);

  const stableRating = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const base = 7.8 + (h % 180) / 100;
    return Math.max(7.8, Math.min(9.8, base));
  };

  const toUI = (m: Manga): MangaItemUI => {
    let chapterNum: number | string = 0;
    if (m.latest_chapter) {
      const parsed = parseFloat(m.latest_chapter);
      chapterNum = isNaN(parsed) ? m.latest_chapter : parsed;
    } else if (m.chapter_count) {
      chapterNum = m.chapter_count;
    }

    return {
      id: m.id,
      title: m.title,
      image: m.cover_url || '',
      status: m.status,
      rating: stableRating(m.id),
      chapters: chapterNum,
      updatedAt: m.updated_at || new Date().toISOString(),
    };
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const status = activeFilter === 'Todos' ? undefined : activeFilter;
        const q = search.trim();
        const list = await mangaApi.list({
          page: 1,
          limit: isSmallScreen ? 24 : 48,
          status,
          search: q || undefined,
          order: 'updated',
        });
        const pop = await mangaApi.popular({ limit: 3 });
        if (cancelled) return;
        setItems((list.items || list.data || []) as any);
        setPopular((pop.items || []) as any);
      } catch {
        if (cancelled) return;
        setItems([]);
        setPopular([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(run, 260);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [activeFilter, search, isSmallScreen]);

  // 8 columnas en pantallas grandes para evitar el espacio negro
  const columns = isSmallScreen ? 2 : 8;
  const mapped = useMemo(() => items.map(toUI), [items]);
  const chunks: typeof mapped[] = [];
  for (let i = 0; i < mapped.length; i += columns) {
    chunks.push(mapped.slice(i, i + columns));
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>


      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[0]}
      >
        <View style={[styles.headerArea, { backgroundColor: colors.background }]}>
          <Text style={styles.superTitle}>LEE EN LÍNEA</Text>
          <Text style={[styles.mainTitle, { color: colors.text }]}>
            MANG<Text style={{color: '#E50914'}}>A</Text>
          </Text>
          
          <View style={[styles.searchWrapper, { backgroundColor: colors.card, borderColor: theme === 'dark' ? '#222' : 'rgba(0,0,0,0.1)' }]}>
            <View style={styles.searchRedLine} />
            <Ionicons name="search" size={20} color={colors.textMuted || "#444"} style={{marginLeft: 16, marginRight: 12}} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }, Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}]}
              placeholder="Buscar manga..."
              placeholderTextColor={colors.textMuted || "#444"}
              value={search}
              onChangeText={setSearch}
            />
            {loading && <ActivityIndicator size="small" color="#E50914" style={{ marginRight: 16 }} />}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.filtersWrapper}>
            <MangaFilterChips active={activeFilter} onChange={setActiveFilter} />
            <Text style={[styles.resultsCount, { color: colors.textMuted }]}>{mapped.length} resultados</Text>
          </View>

          {/* ── GRID DE CARDS ── */}
          {loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color="#E50914" />
            </View>
          ) : mapped.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="book-outline" size={48} color={theme === 'dark' ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.2)"} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No hay manga para este filtro.</Text>
            </View>
          ) : (
            <View style={{ marginTop: 24, gap: 12 }}>
              {chunks.map((row, rIdx) => (
                <View key={`row-${rIdx}`} style={styles.gridRow}>
                  {row.map((it) => (
                    <MangaCard
                      key={it.id}
                      item={it}
                      onPress={() => navigation.navigate('MangaDetail', { id: it.id })}
                    />
                  ))}
                  {/* Fill empty spaces in last row if needed (Flexbox) */}
                  {Array.from({ length: columns - row.length }).map((_, fIdx) => (
                    <View key={`fill-${rIdx}-${fIdx}`} style={{ flex: 1, minWidth: 140 }} />
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── POPULARES (RANKING) ── */}
        {!search.trim() && popular.length > 0 && (
          <View style={[styles.section, { marginTop: 40 }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Ranking Popular</Text>
            </View>
            <View style={styles.rankingGrid}>
              {popular.map((p, idx) => (
                <MangaRankingItem
                  key={p.id}
                  item={{
                    id: p.id,
                    title: p.title,
                    image: p.cover_url || '',
                    status: p.status,
                    rating: stableRating(p.id),
                    chapters: p.chapter_count || 0,
                    rank: p.rank,
                    updatedAt: p.updated_at || '',
                  }}
                  isTop={idx === 0}
                  onPress={() => navigation.navigate('MangaDetail', { id: p.id })}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  headerArea: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 80 : 50,
    paddingBottom: 10,
    zIndex: 10,
  },
  superTitle: {
    color: '#E50914',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 4,
  },
  mainTitle: {
    color: '#FFF',
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: -2,
    marginBottom: 20,
    lineHeight: 52,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    height: 48,
    position: 'relative',
    marginBottom: 10,
  },
  searchRedLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#E50914',
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 15,
    fontWeight: '500',
    height: '100%',
  },
  scrollContent: {
    paddingBottom: 60,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 36,
  },
  filtersWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    paddingBottom: 10,
  },
  resultsCount: {
    color: '#555',
    fontSize: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
  },
  loaderContainer: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankingCol: { flexDirection: 'column' },
  rankingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});
