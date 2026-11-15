import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, useWindowDimensions, Platform, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { catalogService, CatalogAnime } from '../services/catalogService';
import { backendClient } from '../services/backendClient';
import { animeSearchResult } from '../services/universalSearch';
import { isPublicCatalogItem } from '../utils/publicCatalog';
import Header from '../components/Header';
import DiscoveryCard from '../components/DiscoveryCard';
import { useTabNavigation } from '../hooks/useTabNavigation';
import MovieModal from '../components/MovieModal';
import { ContentItem } from '../types';
import { useTheme } from '../contexts/ThemeContext';

const DAYS = [{ id: 'monday', label: 'Lunes', short: 'Lun' }, { id: 'tuesday', label: 'Martes', short: 'Mar' }, { id: 'wednesday', label: 'Miércoles', short: 'Mié' }, { id: 'thursday', label: 'Jueves', short: 'Jue' }, { id: 'friday', label: 'Viernes', short: 'Vie' }, { id: 'saturday', label: 'Sábado', short: 'Sáb' }, { id: 'sunday', label: 'Domingo', short: 'Dom' }];
const normalize = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export default function AiringScreen() {
  const { colors, theme } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const native = Platform.OS === 'android';
  const compact = width < 768;
  const contentWidth = Math.min(1280, width - (compact ? 32 : 80));
  const columns = compact ? (width < 520 ? 2 : 3) : width < 1050 ? 4 : 6;
  const gap = compact ? 14 : 24;
  const itemWidth = (contentWidth - gap * (columns - 1)) / columns;
  const { navigateByLabel } = useTabNavigation();
  const [tab, setTab] = useState<'local' | 'calendar'>('local');
  const [day, setDay] = useState(() => new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Tokyo' }).format(new Date()).toLowerCase());
  const [local, setLocal] = useState<CatalogAnime[]>([]), [calendar, setCalendar] = useState<any[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const scheduleGeneration = useRef(0);
  const [schedule, setSchedule] = useState<any>(null), [resolving, setResolving] = useState(false), [availability, setAvailability] = useState('');
  useEffect(() => {
    const request = ++generation.current;
    setLoading(true); setError('');
    const run = async () => {
      try {
        if (tab === 'local') {
          const response = await catalogService.getAnimeList({ status: 'Airing', limit: 100 });
          if (generation.current === request) setLocal([...new Map(response.data.map(item => [String(item.id), item])).values()]);
        } else {
          const { data } = await backendClient.get('/api/schedules', { params: { filter: day } });
          const rows = (Array.isArray(data?.data) ? data.data : []).filter(isPublicCatalogItem);
          if (generation.current === request) setCalendar([...new Map(rows.map((item: any) => [String(item.mal_id), item])).values()]);
        }
      } catch { if (generation.current === request) setError('No pudimos cargar esta sección. Comprueba tu conexión e inténtalo otra vez.'); }
      finally { if (generation.current === request) setLoading(false); }
    };
    void run();
    return () => { generation.current++; };
  }, [tab, tab === 'calendar' ? day : '', retry]);
  const closeCalendar = () => { scheduleGeneration.current++; setSchedule(null); setResolving(false); };
  const openCalendar = (item: any) => { scheduleGeneration.current++; setSchedule(item); setAvailability(''); setResolving(false); };
  const findLocal = async () => {
    const current = schedule; if (!current || resolving) return;
    const request = ++scheduleGeneration.current;
    setResolving(true); setAvailability('');
    try {
      const rows = await catalogService.searchAnime(current.title);
      if (request !== scheduleGeneration.current) return;
      const match = rows.find(row => [row.title, row.title_english, row.title_japanese].some(title => title && normalize(title) === normalize(current.title)));
      if (match) { closeCalendar(); setSelectedContent(animeSearchResult(match).content); }
      else setAvailability('Este título todavía no está disponible en el catálogo de Pixel.');
    } catch { if (request === scheduleGeneration.current) setAvailability('No se pudo comprobar la disponibilidad. Inténtalo de nuevo.'); }
    finally { if (request === scheduleGeneration.current) setResolving(false); }
  };
  const data = tab === 'local' ? local : calendar;
  const listHeader = <>
    <View style={[s.heading, native && { paddingTop: 16, marginBottom: 22 }]}>
      <View style={{ flex: 1 }}><Text style={[s.eyebrow, { color: colors.textMuted }]}>{native ? 'TU AGENDA DE ANIME' : 'SIGUE TUS SERIES CADA SEMANA'}</Text><Text style={[s.title, { color: colors.text, fontSize: compact ? 30 : 42 }]}>En emisión</Text>{!native && <Text style={[s.subtitle, { color: colors.textMuted }]}>Encuentra qué ver y consulta los próximos estrenos.</Text>}</View>
      {!compact && <Ionicons name="radio-outline" size={34} color={colors.textMuted} />}
    </View>
    <View style={[s.tabs, { backgroundColor: colors.card, alignSelf: compact ? 'stretch' : 'flex-start' }]}>
      {(['local', 'calendar'] as const).map(value => <TouchableOpacity key={value} accessibilityRole="tab" accessibilityLabel={value === 'local' ? 'Disponibles en Pixel' : 'Calendario semanal'} accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[s.tab, compact && { flex: 1 }, tab === value && { backgroundColor: theme === 'dark' ? '#283432' : '#dce8e5' }]}>
        <Ionicons name={value === 'local' ? 'play-circle-outline' : 'calendar-outline'} size={17} color={tab === value ? colors.text : colors.textMuted} /><Text style={{ color: tab === value ? colors.text : colors.textMuted, fontSize: 13, fontWeight: '600' }}>{value === 'local' ? 'Disponibles' : 'Calendario'}</Text>
      </TouchableOpacity>)}
    </View>
    {tab === 'calendar' && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.days}>{DAYS.map(value => <TouchableOpacity key={value.id} accessibilityRole="button" accessibilityState={{ selected: day === value.id }} onPress={() => setDay(value.id)} style={[s.day, { borderBottomColor: day === value.id ? colors.text : 'transparent' }]}><Text style={{ color: day === value.id ? colors.text : colors.textMuted, fontSize: 13, fontWeight: day === value.id ? '700' : '400' }}>{compact ? value.short : value.label}</Text></TouchableOpacity>)}</ScrollView>}
    <View style={s.section}><Text style={[s.sectionTitle, { color: colors.text }]}>{tab === 'local' ? 'Para seguir esta temporada' : DAYS.find(value => value.id === day)?.label}</Text><Text style={[s.count, { color: colors.textMuted }]}>{tab === 'calendar' ? 'Horario de Japón' : `${local.length} títulos`}</Text></View>
  </>;
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <Header black={theme === 'dark'} activeSection="Emisión" onNavPress={navigateByLabel} onSearchPress={() => navigateByLabel('Buscar')} onProfilePress={() => navigateByLabel('Perfil')} />
    <View style={{ height: Platform.OS === 'web' ? 90 : 56 + insets.top }} />
    <FlatList key={`${columns}:${tab}`} data={loading || error ? [] : data} numColumns={columns} keyExtractor={(item: any) => String(tab === 'local' ? item.id : item.mal_id)} ListHeaderComponent={listHeader}
      style={{ width: contentWidth, alignSelf: 'center' }} contentContainerStyle={{ paddingBottom: 110 }} columnWrapperStyle={{ gap }} showsVerticalScrollIndicator={false}
      renderItem={({ item }: any) => <DiscoveryCard width={itemWidth} title={item.title} poster={tab === 'local' ? item.poster_url : item.images?.jpg?.large_image_url || item.images?.webp?.large_image_url}
        rating={Number(tab === 'local' ? item.rating : item.score) || undefined} caption={tab === 'local' ? (item.total_episodes ? `${item.total_episodes} ${Number(item.total_episodes) === 1 ? 'episodio' : 'episodios'} · En emisión` : 'En emisión') : item.broadcast?.time ? `${item.broadcast.time} · Japón` : 'Horario por confirmar'}
        onPress={() => tab === 'local' ? setSelectedContent(animeSearchResult(item).content) : openCalendar(item)} />}
      ListEmptyComponent={<View style={s.empty}>{loading ? <ActivityIndicator color={colors.textMuted} /> : <><Ionicons name={error ? 'cloud-offline-outline' : 'calendar-outline'} size={32} color={colors.textMuted} /><Text style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 22 }}>{error || 'No hay títulos para mostrar en esta selección.'}</Text>{!!error && <TouchableOpacity accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={[s.retry, { backgroundColor: colors.card }]}><Text style={{ color: colors.text }}>Reintentar</Text></TouchableOpacity>}</>}</View>} />
    <MovieModal content={selectedContent} visible={!!selectedContent} onClose={() => setSelectedContent(null)} />
    <Modal visible={!!schedule} transparent animationType="fade" onRequestClose={closeCalendar}>
      <View style={s.backdrop}><View style={[s.schedule, { backgroundColor: colors.card, width: Math.min(600, width - 32) }]}>
        <View style={s.section}><Text style={[s.eyebrow, { color: colors.textMuted }]}>CALENDARIO · JAPÓN</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar información del calendario" onPress={closeCalendar} style={{ padding: 10 }}><Ionicons name="close" size={23} color={colors.text} /></TouchableOpacity></View>
        <ScrollView><Text style={[s.sectionTitle, { color: colors.text, fontSize: 24 }]}>{schedule?.title}</Text><Text style={{ color: colors.textMuted, marginTop: 12, lineHeight: 23 }}>{schedule?.synopsis || 'Sin descripción disponible.'}</Text></ScrollView>
        {!!availability && <Text style={{ color: colors.textMuted, lineHeight: 20, marginTop: 16 }}>{availability}</Text>}
        <TouchableOpacity accessibilityRole="button" disabled={resolving} accessibilityState={{ busy: resolving }} onPress={findLocal} style={[s.retry, { backgroundColor: theme === 'dark' ? '#283432' : '#dce8e5', marginTop: 20 }]}>{resolving ? <ActivityIndicator color={colors.text} /> : <Text style={{ color: colors.text, fontWeight: '600' }}>Buscar en el catálogo de Pixel</Text>}</TouchableOpacity>
      </View></View>
    </Modal>
  </View>;
}
const s = StyleSheet.create({
  heading: { paddingTop: 28, marginBottom: 28, flexDirection: 'row', alignItems: 'center', gap: 20 }, eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: '600' }, title: { fontWeight: '700', letterSpacing: -1, marginTop: 8 }, subtitle: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  tabs: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 4, marginBottom: 22 }, tab: { minHeight: 44, paddingHorizontal: 18, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 3 },
  days: { gap: 16, paddingBottom: 16 }, day: { paddingVertical: 12, minWidth: 40, alignItems: 'center', borderBottomWidth: 2 }, section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }, sectionTitle: { fontSize: 18, fontWeight: '600', flexShrink: 1 }, count: { fontSize: 11 }, empty: { padding: 38, alignItems: 'center', gap: 18 }, retry: { paddingHorizontal: 20, paddingVertical: 14, alignItems: 'center', borderRadius: 3, minHeight: 44 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }, schedule: { padding: 24, maxHeight: '80%', borderRadius: 6 },
});
