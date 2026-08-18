import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { AdminShell } from '../../components/admin/AdminShell'
import { adminApiService } from '../../services/adminApiService'
import { adminColors } from '../../theme'

interface BotJob {
  id: string
  type: string
  animeId: number
  status: 'running' | 'done' | 'error'
  progress: { current: number; total: number; message: string }
  errors: string[]
  result: any
  startedAt: string
  finishedAt: string | null
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'done' ? '#22c55e' : status === 'error' ? '#ef4444' : '#f59e0b'
  const label = status === 'done' ? '✓ Listo' : status === 'error' ? '✗ Error' : '⟳ Corriendo'
  return (
    <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color + '60' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  )
}

export default function AdminBotScreen() {
  const [animeId, setAnimeId] = useState('')
  const [jkSlug, setJkSlug] = useState('')
  const [av1Slug, setAv1Slug] = useState('')
  const [source, setSource] = useState<'auto' | 'jkanime' | 'animeav1'>('auto')
  const [fromEp, setFromEp] = useState('1')
  const [toEp, setToEp] = useState('')
  const [season, setSeason] = useState('1')
  const [previewTitle, setPreviewTitle] = useState('')
  const [jobs, setJobs] = useState<BotJob[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewAv1Data, setPreviewAv1Data] = useState<any>(null)
  const [slugResult, setSlugResult] = useState<string | null | undefined>(undefined)
  const [slugAv1Result, setSlugAv1Result] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await adminApiService.axiosInstance.get('/api/admin/bot/status')
      setJobs(res.data.jobs || [])
    } catch {
      // silencioso
    }
  }, [])

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 4000)
    return () => clearInterval(interval)
  }, [fetchJobs])

  const handleAction = async (action: string) => {
    setError(null)
    setSuccessMsg(null)
    setLoading(action)

    try {
      if (action === 'metadata') {
        const res = await adminApiService.axiosInstance.post(`/api/admin/bot/metadata/${animeId}`)
        setSuccessMsg(`Job iniciado: ${res.data.jobId}`)
      } else if (action === 'scrape') {
        const res = await adminApiService.axiosInstance.post(`/api/admin/bot/scrape/${animeId}`, {
          jkSlug: jkSlug || undefined,
          av1Slug: av1Slug || undefined,
          source,
          fromEpisode: parseInt(fromEp) || 1,
          toEpisode: toEp ? parseInt(toEp) : undefined,
          season: parseInt(season) || 1,
        })
        setSuccessMsg(`Scrape iniciado: ${res.data.jobId}`)
      } else if (action === 'both') {
        const res = await adminApiService.axiosInstance.post(`/api/admin/bot/metadata-and-scrape/${animeId}`, {
          jkSlug: jkSlug || undefined,
          av1Slug: av1Slug || undefined,
          source,
          fromEpisode: parseInt(fromEp) || 1,
          toEpisode: toEp ? parseInt(toEp) : undefined,
          season: parseInt(season) || 1,
        })
        setSuccessMsg(`Jobs iniciados: ${JSON.stringify(res.data.jobs)}`)
      } else if (action === 'createAndScrape') {
        const res = await adminApiService.axiosInstance.post('/api/admin/bot/create-and-scrape', {
          title: previewTitle,
          jkSlug: jkSlug || undefined,
          av1Slug: av1Slug || undefined,
          source,
          fromEpisode: parseInt(fromEp) || 1,
          toEpisode: toEp ? parseInt(toEp) : undefined,
          season: parseInt(season) || 1,
        })
        setAnimeId(String(res.data.animeId))
        setSuccessMsg(`Anime Creado (ID: ${res.data.animeId}) y Jobs iniciados!`)
      } else if (action === 'syncAiring') {
        const res = await adminApiService.axiosInstance.post('/api/admin/bot/sync-airing')
        setSuccessMsg(res.data.message)
      } else if (action === 'findSlug') {
        const res = await adminApiService.axiosInstance.post('/api/admin/bot/find-slug', { title: previewTitle })
        setSlugResult(res.data.slug || null)
      } else if (action === 'findSlugAv1') {
        const res = await adminApiService.axiosInstance.post('/api/admin/bot/find-slug-av1', { title: previewTitle })
        setSlugAv1Result(res.data.slug || null)
      } else if (action === 'previewAnilist') {
        const res = await adminApiService.axiosInstance.post('/api/admin/bot/preview-anilist', { title: previewTitle })
        setPreviewData(res.data.data || null)
        if (!res.data.ok) setError(res.data.message)
      } else if (action === 'previewAv1') {
        const res = await adminApiService.axiosInstance.post('/api/admin/bot/preview-av1', { slug: previewTitle })
        setPreviewAv1Data(res.data.data || null)
        if (!res.data.ok) setError(res.data.message)
      }
      await fetchJobs()
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Error')
    } finally {
      setLoading(null)
    }
  }

  const activeJobs = jobs.filter(j => j.status === 'running')
  const finishedJobs = jobs.filter(j => j.status !== 'running')

  return (
    <AdminShell activeKey="bot">
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="hardware-chip-outline" size={22} color={adminColors.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Bot Inteligente</Text>
            <Text style={styles.headerSub}>AniList + JKAnime Scraper</Text>
          </View>
          {activeJobs.length > 0 && (
            <View style={styles.runningPill}>
              <ActivityIndicator size="small" color="#f59e0b" style={{ marginRight: 6 }} />
              <Text style={styles.runningPillText}>{activeJobs.length} corriendo</Text>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* — Configuración — */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>⚙️ Configuración</Text>

            <Text style={styles.label}>ID del Anime (en tu BD) *</Text>
            <TextInput
              style={styles.input}
              value={animeId}
              onChangeText={setAnimeId}
              placeholder="Ej: 42"
              placeholderTextColor={adminColors.textSecondary}
              keyboardType="numeric"
            />

            {/* Selector de fuente */}
            <Text style={styles.label}>Fuente de Episodios</Text>
            <View style={styles.sourceRow}>
              {(['auto', 'jkanime', 'animeav1'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.sourceBtn, source === s && styles.sourceBtnActive]}
                  onPress={() => setSource(s)}
                >
                  <Text style={[styles.sourceBtnText, source === s && styles.sourceBtnTextActive]}>
                    {s === 'auto' ? '⚡ Auto' : s === 'jkanime' ? 'JKAnime' : '🎌 AV1'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {source === 'auto' && (
              <Text style={styles.sourceHint}>Intenta JKAnime primero; si falla, usa AnimeAV1 automáticamente.</Text>
            )}

            {/* Slug JKAnime (solo si no es solo animeav1) */}
            {source !== 'animeav1' && (
              <>
                <Text style={styles.label}>Slug JKAnime (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={jkSlug}
                  onChangeText={setJkSlug}
                  placeholder="Ej: black-clover"
                  placeholderTextColor={adminColors.textSecondary}
                />
              </>
            )}

            {/* Slug AnimeAV1 (solo si no es solo jkanime) */}
            {source !== 'jkanime' && (
              <>
                <Text style={styles.label}>Slug AnimeAV1 (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={av1Slug}
                  onChangeText={setAv1Slug}
                  placeholder="Ej: tenkou-saki-no-seiso-karen..."
                  placeholderTextColor={adminColors.textSecondary}
                />
              </>
            )}

            <View style={styles.row}>
              <View style={styles.rowCol}>
                <Text style={styles.label}>Desde episodio</Text>
                <TextInput
                  style={styles.input}
                  value={fromEp}
                  onChangeText={setFromEp}
                  keyboardType="numeric"
                  placeholder="1"
                  placeholderTextColor={adminColors.textSecondary}
                />
              </View>
              <View style={styles.rowCol}>
                <Text style={styles.label}>Hasta episodio</Text>
                <TextInput
                  style={styles.input}
                  value={toEp}
                  onChangeText={setToEp}
                  keyboardType="numeric"
                  placeholder="Auto"
                  placeholderTextColor={adminColors.textSecondary}
                />
              </View>
              <View style={styles.rowCol}>
                <Text style={styles.label}>Temporada</Text>
                <TextInput
                  style={styles.input}
                  value={season}
                  onChangeText={setSeason}
                  keyboardType="numeric"
                  placeholder="1"
                  placeholderTextColor={adminColors.textSecondary}
                />
              </View>
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}
            {!!successMsg && <Text style={styles.successText}>{successMsg}</Text>}

            {/* Botones de acción */}
            <View style={styles.actionGrid}>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, !animeId && styles.btnDisabled]}
                onPress={() => handleAction('metadata')}
                disabled={!animeId || !!loading}
              >
                {loading === 'metadata' ? (
                  <ActivityIndicator size="small" color={adminColors.text} />
                ) : (
                  <>
                    <Ionicons name="sparkles-outline" size={16} color={adminColors.text} />
                    <Text style={styles.btnSecondaryText}>Solo Metadatos</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, !animeId && styles.btnDisabled]}
                onPress={() => handleAction('scrape')}
                disabled={!animeId || !!loading}
              >
                {loading === 'scrape' ? (
                  <ActivityIndicator size="small" color={adminColors.text} />
                ) : (
                  <>
                    <Ionicons name="cloud-download-outline" size={16} color={adminColors.text} />
                    <Text style={styles.btnSecondaryText}>Solo Episodios</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, !animeId && styles.btnDisabled]}
                onPress={() => handleAction('both')}
                disabled={!animeId || !!loading}
              >
                {loading === 'both' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="flash-outline" size={16} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Todo (Meta + Eps)</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* — Piloto Automático — */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>✈️ Piloto Automático (Emisiones)</Text>
            <Text style={styles.label}>
              Escanea JKAnime buscando animes "En Emisión". Si no existen, los crea.
              Luego descarga automáticamente los episodios más recientes de todos ellos.
            </Text>
            
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, { backgroundColor: '#10b981', marginTop: 10 }]}
              onPress={() => handleAction('syncAiring')}
              disabled={!!loading}
            >
              {loading === 'syncAiring' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="radio-outline" size={16} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Sincronizar Emisiones Actuales</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* — Herramientas de prueba — */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🔍 Herramientas de Prueba</Text>
            <Text style={styles.label}>Título del anime</Text>
            <TextInput
              style={styles.input}
              value={previewTitle}
              onChangeText={setPreviewTitle}
              placeholder="Ej: Black Clover"
              placeholderTextColor={adminColors.textSecondary}
            />

            <View style={styles.toolRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnTool, !previewTitle && styles.btnDisabled]}
                onPress={() => handleAction('findSlug')}
                disabled={!previewTitle || !!loading}
              >
                {loading === 'findSlug' ? (
                  <ActivityIndicator size="small" color={adminColors.text} />
                ) : (
                  <Text style={styles.btnToolText}>🔍 Slug JKAnime</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnTool, !previewTitle && styles.btnDisabled]}
                onPress={() => handleAction('findSlugAv1')}
                disabled={!previewTitle || !!loading}
              >
                {loading === 'findSlugAv1' ? (
                  <ActivityIndicator size="small" color={adminColors.text} />
                ) : (
                  <Text style={styles.btnToolText}>🎌 Slug AV1</Text>
                )}
              </TouchableOpacity>
            </View>
            <View style={styles.toolRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnTool, !previewTitle && styles.btnDisabled]}
                onPress={() => handleAction('previewAnilist')}
                disabled={!previewTitle || !!loading}
              >
                {loading === 'previewAnilist' ? (
                  <ActivityIndicator size="small" color={adminColors.text} />
                ) : (
                  <Text style={styles.btnToolText}>Preview AniList</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnTool, !previewTitle && styles.btnDisabled]}
                onPress={() => handleAction('previewAv1')}
                disabled={!previewTitle || !!loading}
              >
                {loading === 'previewAv1' ? (
                  <ActivityIndicator size="small" color={adminColors.text} />
                ) : (
                  <Text style={styles.btnToolText}>Preview AV1</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, !previewTitle && styles.btnDisabled]}
                onPress={() => handleAction('createAndScrape')}
                disabled={!previewTitle || !!loading}
              >
                {loading === 'createAndScrape' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="color-wand-outline" size={16} color="#fff" />
                    <Text style={styles.btnPrimaryText}>✨ Crear Anime y Scrapear Todo</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {slugResult !== undefined && (
              <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>Slug JKAnime encontrado:</Text>
                <Text style={[styles.resultValue, !slugResult && { color: '#ef4444' }]}>
                  {slugResult || 'No encontrado'}
                </Text>
              </View>
            )}

            {slugAv1Result !== undefined && (
              <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>Slug AnimeAV1 encontrado:</Text>
                <Text style={[styles.resultValue, !slugAv1Result && { color: '#ef4444' }]}>
                  {slugAv1Result || 'No encontrado'}
                </Text>
              </View>
            )}

            {previewData && (
              <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>AniList devolvería:</Text>
                <Text style={styles.resultKey}>Título: <Text style={styles.resultValue}>{previewData.title}</Text></Text>
                <Text style={styles.resultKey}>Inglés: <Text style={styles.resultValue}>{previewData.title_english || '—'}</Text></Text>
                <Text style={styles.resultKey}>Rating: <Text style={styles.resultValue}>{previewData.rating?.toFixed(1) || '—'}</Text></Text>
                <Text style={styles.resultKey}>Episodios: <Text style={styles.resultValue}>{previewData.total_episodes || '—'}</Text></Text>
                <Text style={styles.resultKey}>Estado: <Text style={styles.resultValue}>{previewData.status || '—'}</Text></Text>
                <Text style={styles.resultKey}>Géneros: <Text style={styles.resultValue}>{previewData.genres?.join(', ') || '—'}</Text></Text>
              </View>
            )}

            {previewAv1Data && (
              <View style={[styles.resultBox, { borderColor: '#6366f140' }]}>
                <Text style={styles.resultLabel}>🎌 AnimeAV1 devolvería:</Text>
                <Text style={styles.resultKey}>Título: <Text style={styles.resultValue}>{previewAv1Data.title}</Text></Text>
                <Text style={styles.resultKey}>Score: <Text style={styles.resultValue}>{previewAv1Data.score?.toFixed(2) || '—'}</Text></Text>
                <Text style={styles.resultKey}>Episodios: <Text style={styles.resultValue}>{previewAv1Data.episodesCount || '—'}</Text></Text>
                <Text style={styles.resultKey}>Estado: <Text style={styles.resultValue}>{previewAv1Data.status || '—'}</Text></Text>
                <Text style={styles.resultKey}>Géneros: <Text style={styles.resultValue}>{previewAv1Data.genres?.join(', ') || '—'}</Text></Text>
                <Text style={styles.resultKey}>MAL ID: <Text style={styles.resultValue}>{previewAv1Data.malId || '—'}</Text></Text>
              </View>
            )}
          </View>

          {/* — Jobs activos — */}
          {activeJobs.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>⟳ En progreso</Text>
              {activeJobs.map(job => (
                <View key={job.id} style={styles.jobRow}>
                  <View style={styles.jobMain}>
                    <View style={styles.jobHeader}>
                      <Text style={styles.jobType}>{job.type === 'metadata' ? '✨ Metadatos' : '📥 Scrape'}</Text>
                      <StatusBadge status={job.status} />
                    </View>
                    <Text style={styles.jobMsg}>{job.progress.message}</Text>
                    {job.progress.total > 0 && (
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${Math.min(100, (job.progress.current / job.progress.total) * 100)}%` },
                          ]}
                        />
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* — Historial — */}
          {finishedJobs.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📋 Historial reciente</Text>
              {finishedJobs.slice(0, 8).map(job => (
                <View key={job.id} style={styles.jobRow}>
                  <View style={styles.jobMain}>
                    <View style={styles.jobHeader}>
                      <Text style={styles.jobType}>{job.type === 'metadata' ? '✨ Meta' : '📥 Scrape'} · anime {job.animeId}</Text>
                      <StatusBadge status={job.status} />
                    </View>
                    {job.status === 'done' && job.result && (
                      <Text style={styles.jobMsg}>
                        {job.type === 'metadata'
                          ? `${job.result.updated} campos actualizados`
                          : `${job.result.inserted} insertados, ${job.result.updated} actualizados de ${job.result.totalFound} · ${job.result.source ? `[${job.result.source}]` : ''}`}
                      </Text>
                    )}
                    {job.status === 'error' && (
                      <Text style={styles.jobError}>{job.errors[0]}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </AdminShell>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminColors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: adminColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: adminColors.border,
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: adminColors.primary + '15',
    borderWidth: 1, borderColor: adminColors.primary + '40',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: adminColors.text },
  headerSub: { fontSize: 12, color: adminColors.textSecondary, marginTop: 2 },
  runningPill: {
    marginLeft: 'auto', flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f59e0b20', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#f59e0b40',
  },
  runningPillText: { color: '#f59e0b', fontWeight: '800', fontSize: 12 },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  card: {
    backgroundColor: adminColors.surface, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: adminColors.border,
  },
  cardTitle: { fontSize: 14, fontWeight: '900', color: adminColors.text, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', color: adminColors.textSecondary, marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: adminColors.background, borderWidth: 1,
    borderColor: adminColors.border, borderRadius: 10,
    padding: 12, color: adminColors.text, fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  rowCol: { flex: 1 },
  actionGrid: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  sourceRow: { flexDirection: 'row', gap: 6, marginTop: 6, marginBottom: 2 },
  sourceBtn: {
    flex: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: adminColors.background, borderWidth: 1, borderColor: adminColors.border,
  },
  sourceBtnActive: { backgroundColor: adminColors.primary + '20', borderColor: adminColors.primary },
  sourceBtnText: { fontSize: 11, fontWeight: '700', color: adminColors.textSecondary },
  sourceBtnTextActive: { color: adminColors.primary },
  sourceHint: { fontSize: 11, color: adminColors.textSecondary, marginTop: 4, fontStyle: 'italic' },
  toolRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: {
    flex: 1, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
  },
  btnPrimary: { backgroundColor: adminColors.primary },
  btnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  btnSecondary: {
    backgroundColor: adminColors.background, borderWidth: 1, borderColor: adminColors.border,
  },
  btnSecondaryText: { color: adminColors.text, fontWeight: '700', fontSize: 13 },
  btnTool: {
    backgroundColor: adminColors.background, borderWidth: 1, borderColor: adminColors.border,
  },
  btnToolText: { color: adminColors.text, fontWeight: '700', fontSize: 12 },
  btnDisabled: { opacity: 0.4 },
  errorText: { marginTop: 10, color: '#ef4444', fontWeight: '700', fontSize: 13 },
  successText: { marginTop: 10, color: '#22c55e', fontWeight: '700', fontSize: 13 },
  resultBox: {
    marginTop: 12, padding: 12, borderRadius: 10,
    backgroundColor: adminColors.background, borderWidth: 1, borderColor: adminColors.border, gap: 4,
  },
  resultLabel: { fontWeight: '900', color: adminColors.text, marginBottom: 6 },
  resultKey: { fontSize: 12, color: adminColors.textSecondary, fontWeight: '700' },
  resultValue: { color: adminColors.text, fontWeight: '600' },
  badge: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '800' },
  jobRow: {
    padding: 12, borderRadius: 10, backgroundColor: adminColors.background,
    borderWidth: 1, borderColor: adminColors.border, marginTop: 10,
  },
  jobMain: { gap: 6 },
  jobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jobType: { fontWeight: '800', color: adminColors.text, fontSize: 13 },
  jobMsg: { fontSize: 12, color: adminColors.textSecondary, fontWeight: '600' },
  jobError: { fontSize: 12, color: '#ef4444', fontWeight: '700' },
  progressBar: {
    height: 4, borderRadius: 999, backgroundColor: adminColors.border, overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 999, backgroundColor: adminColors.primary },
})
