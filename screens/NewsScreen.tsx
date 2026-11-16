import React, { useEffect, useState } from 'react';
import { View, Platform, Alert, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import Header from '../components/Header';
import AndroidNewsFeed from '../components/AndroidNewsFeed';
import WebNewsFeed from '../components/WebNewsFeed';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { newsApi, NewsArticle } from '../services/newsApi';

const categories = ['', 'estreno', 'temporada', 'película', 'tráiler', 'industria', 'manga', 'evento'];
export default function NewsScreen() {
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { navigateByLabel } = useTabNavigation();
  const [category, setCategory] = useState('');
  const [featured, setFeatured] = useState<NewsArticle | null>(null);
  const [items, setItems] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  const requestGeneration = React.useRef(0);
  useEffect(() => {
    const generation = ++requestGeneration.current;
    setLoading(true); setLoadingMore(false); setError(''); setItems([]); setFeatured(null); setPage(1); setTotal(0);
    void Promise.all([
      newsApi.list({ category: category || undefined, page: 1, limit: 24 }, retry > 0),
      category ? Promise.resolve({ featured: null }) : newsApi.featured({ limit: 1 }, retry > 0).catch(() => ({ featured: null })),
    ]).then(([list, highlights]) => {
      if (generation !== requestGeneration.current) return;
      setItems(list.data || []); setTotal(list.pagination.total); setFeatured(highlights.featured);
    }).catch(() => {
      if (generation === requestGeneration.current) setError('No pudimos cargar las noticias. Comprueba tu conexión.');
    }).finally(() => { if (generation === requestGeneration.current) setLoading(false); });
    return () => { requestGeneration.current++; };
  }, [category, retry]);
  const loadMore = async () => {
    if (loadingMore || loading) return;
    const generation = requestGeneration.current;
    setLoadingMore(true); setError('');
    try {
      const list = await newsApi.list({ category: category || undefined, page: page + 1, limit: 24 });
      if (generation !== requestGeneration.current) return;
      setItems(previous => [...new Map([...previous, ...list.data].map(item => [item.slug, item])).values()]);
      setTotal(list.pagination.total); setPage(page + 1);
    } catch { if (generation === requestGeneration.current) setError('No se pudieron cargar más noticias. Inténtalo de nuevo.'); }
    finally { if (generation === requestGeneration.current) setLoadingMore(false); }
  };
  const open = (article: NewsArticle) => {
    if (article.external_url && /^https?:\/\//i.test(article.external_url)) void Linking.openURL(article.external_url).catch(() => Alert.alert('No se pudo abrir la noticia', 'Inténtalo de nuevo.'));
    else navigation.navigate('NewsDetail', { slug: String(article.slug || article.id) });
  };
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <Header black={theme === 'dark'} activeSection="Noticias" onProfilePress={() => navigateByLabel('Perfil')} onSearchPress={() => navigateByLabel('Buscar')} onNavPress={navigateByLabel} />
    <View style={{ height: Platform.OS === 'web' ? 90 : 56 + insets.top }} />
    {Platform.OS === 'android' ? <AndroidNewsFeed onRefresh={() => setRetry(value => value + 1)} items={items} featured={featured} loading={loading} colors={colors} bottomInset={insets.bottom} category={category} categories={categories} onCategoryChange={setCategory} onOpen={open} />
      : <WebNewsFeed items={items} featured={featured} loading={loading} loadingMore={loadingMore} total={total} error={error} colors={colors} category={category} categories={categories} onCategoryChange={setCategory} onOpen={open} onMore={loadMore} onRetry={() => setRetry(value => value + 1)} />}
  </View>;
}
