import { useAdminLayout } from '../../hooks/useAdminLayout';
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { AdminShell } from '../../components/admin/AdminShell'
import { AdminHeader } from '../../components/admin/AdminHeader'
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

function TerminalLog({ jobs, connection }: { jobs: BotJob[]; connection: string }) {
  const scrollViewRef = useRef<ScrollView>(null)
  const activeJobs = jobs.filter((j) => j.status === 'running')
  const finishedJobs = jobs.filter((j) => j.status !== 'running')

  return (
    <View style={styles.terminalContainer}>
      <View style={styles.terminalHeader}>
        <View style={styles.terminalDots}>
          <View style={[styles.terminalDot, { backgroundColor: '#FF5F56' }]} />
          <View style={[styles.terminalDot, { backgroundColor: '#FFBD2E' }]} />
          <View style={[styles.terminalDot, { backgroundColor: '#27C93F' }]} />
        </View>
        <Text style={styles.terminalTitle}>Registro del Bot</Text>
      </View>
      <ScrollView ref={scrollViewRef} style={styles.terminalBody} nestedScrollEnabled>
        <Text style={styles.terminalText}>{connection}</Text>

        {activeJobs.map((job) => (
          <View key={job.id} style={styles.terminalRow}>
            <Text style={styles.terminalTime}>[{new Date().toLocaleTimeString()}]</Text>
            <Text style={styles.terminalActive}>
              {job.type === 'metadata' ? '[META]' : '[SCRAPE]'} ID {job.animeId} - {job.progress.message}...{' '}
              {job.progress.total > 0 ? `(${job.progress.current}/${job.progress.total})` : ''}
            </Text>
          </View>
        ))}

        {finishedJobs.map((job) => (
          <View key={job.id} style={styles.terminalRow}>
            <Text style={styles.terminalTime}>
              [{new Date(job.finishedAt || job.startedAt).toLocaleTimeString()}]
            </Text>
            {job.status === 'done' ? (
              <Text style={styles.terminalSuccess}>
                {job.type === 'metadata' ? '[META]' : '[SCRAPE]'} ID {job.animeId} -{' '}
                {job.type === 'metadata'
                  ? `${job.result?.updated || 0} campos actualizados`
                  : `${job.result?.inserted || 0} insertados, ${job.result?.updated || 0} act.`}
              </Text>
            ) : (
              <Text style={styles.terminalError}>
                {job.type === 'metadata' ? '[META]' : '[SCRAPE]'} ID {job.animeId} - ERROR:{' '}
                {job.errors?.[0] || 'Desconocido'}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

function StatTile({ title, value, accent }: { title: string; value: number; accent: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  )
}

export default function AdminBotScreen() {
  const navigation = useNavigation()
  const { width, isWide, isCompact } = useAdminLayout()

  const [animeId, setAnimeId] = useState('')
  const [jkSlug, setJkSlug] = useState('')
  const [av1Slug, setAv1Slug] = useState('')
  const [source, setSource] = useState<'auto' | 'jkanime' | 'animeav1'>('auto')
  const [fromEp, setFromEp] = useState('1')
  const [toEp, setToEp] = useState('')
  const [season, setSeason] = useState('1')
  const [previewTitle, setPreviewTitle] = useState('')
  const [fixStartId, setFixStartId] = useState('')
  const [fixEndId, setFixEndId] = useState('')
  const [jobs, setJobs] = useState<BotJob[]>([])
  const [connection, setConnection] = useState('Consultando el estado del bot…')
  const [loading, setLoading] = useState<string | null>(null)

  const [previewData, setPreviewData] = useState<any>(null)
  const [slugResult, setSlugResult] = useState<string | null | undefined>(undefined)
  const [slugAv1Result, setSlugAv1Result] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await adminApiService.axiosInstance.get('/api/admin/bot/status')
      setJobs(res.data.jobs || [])
      setConnection('Estado del bot actualizado.')
    } catch {
      setConnection('No se pudo consultar el estado. Se reintentará automáticamente.')
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
        setSuccessMsg(`Anime creado (ID: ${res.data.animeId}) y jobs iniciados`)
      } else if (action === 'syncAiring') {
        const res = await adminApiService.axiosInstance.post('/api/admin/bot/sync-airing')
        setSuccessMsg(res.data.message)
      } else if (action === 'fixImages') {
        const res = await adminApiService.axiosInstance.post('/api/admin/bot/fix-missing-images', {
          startId: fixStartId || undefined,
          endId: fixEndId || undefined,
        })
        setSuccessMsg(res.data.message)
        setFixStartId('')
        setFixEndId('')
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
      }
      setAnimeId('')
      setJkSlug('')
      setAv1Slug('')
      await fetchJobs()
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Error')
    } finally {
      setLoading(null)
    }
  }

  const activeJobs = jobs.filter((j) => j.status === 'running')
  const doneJobs = jobs.filter((j) => j.status === 'done')
  const errorJobs = jobs.filter((j) => j.status === 'error')

  return (
    <AdminShell activeKey="bot">
      <SafeAreaView style={styles.container} edges={['top']}>
        <AdminHeader
          title="Bot Inteligente"
          subtitle="Motor de scraping y metadatos"
          onBack={() => (navigation as any).goBack()}
        />

        <ScrollView contentContainerStyle={[styles.scrollContent, isCompact && styles.scrollContentCompact]}>
          <View style={styles.pageInner}>
            {/* Resumen */}
            <View style={styles.statsRow}>
              <StatTile title="En progreso" value={activeJobs.length} accent="#2563eb" />
              <StatTile title="Completados" value={doneJobs.length} accent="#16a34a" />
              <StatTile title="Errores" value={errorJobs.length} accent={adminColors.primary} />
            </View>

            <View style={[styles.mainGrid, isWide && styles.mainGridWide]}>
              {/* Columna Izquierda: Controles */}
              <View style={[styles.col, isWide && styles.leftCol]}>
                {/* Scraping manual */}
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionTitle}>Configuración manual</Text>

                  <View style={styles.formRow}>
                    <View style={styles.fieldSmall}>
                      <Text style={styles.label}>ID del Anime *</Text>
                      <TextInput
                        style={styles.input}
                        value={animeId}
                        onChangeText={setAnimeId}
                        placeholder="Ej: 42"
                        placeholderTextColor={adminColors.textSecondary}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.fieldWide}>
                      <Text style={styles.label}>Fuente</Text>
                      <View style={styles.sourceRow}>
                        {(['auto', 'jkanime', 'animeav1'] as const).map((s) => (
                          <TouchableOpacity
                            key={s}
                            style={[styles.sourceBtn, source === s && styles.sourceBtnActive]}
                            onPress={() => setSource(s)}
                          >
                            <Text style={[styles.sourceBtnText, source === s && styles.sourceBtnTextActive]}>
                              {s === 'auto' ? 'Auto' : s === 'jkanime' ? 'JKAnime' : 'AV1'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  <View style={styles.formRow}>
                    <View style={styles.fieldHalf}>
                      <Text style={styles.label}>Slug JKAnime (Opc.)</Text>
                      <TextInput
                        style={styles.input}
                        value={jkSlug}
                        onChangeText={setJkSlug}
                        placeholder="Ej: naruto"
                        placeholderTextColor={adminColors.textSecondary}
                      />
                    </View>
                    <View style={styles.fieldHalf}>
                      <Text style={styles.label}>Slug AV1 (Opc.)</Text>
                      <TextInput
                        style={styles.input}
                        value={av1Slug}
                        onChangeText={setAv1Slug}
                        placeholder="Ej: naruto-shippuden"
                        placeholderTextColor={adminColors.textSecondary}
                      />
                    </View>
                  </View>

                  <View style={styles.formRow}>
                    <View style={styles.fieldThird}>
                      <Text style={styles.label}>Desde Ep.</Text>
                      <TextInput
                        style={styles.input}
                        value={fromEp}
                        onChangeText={setFromEp}
                        keyboardType="numeric"
                        placeholder="1"
                        placeholderTextColor={adminColors.textSecondary}
                      />
                    </View>
                    <View style={styles.fieldThird}>
                      <Text style={styles.label}>Hasta Ep.</Text>
                      <TextInput
                        style={styles.input}
                        value={toEp}
                        onChangeText={setToEp}
                        keyboardType="numeric"
                        placeholder="Auto"
                        placeholderTextColor={adminColors.textSecondary}
                      />
                    </View>
                    <View style={styles.fieldThird}>
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

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnSecondary, !animeId && styles.btnDisabled]}
                      onPress={() => handleAction('metadata')}
                      disabled={!animeId || !!loading}
                    >
                      {loading === 'metadata' ? (
                        <ActivityIndicator size="small" color={adminColors.text} />
                      ) : (
                        <Text style={styles.btnSecondaryText}>Solo Meta</Text>
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
                        <Text style={styles.btnSecondaryText}>Solo Episodios</Text>
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
                        <Text style={styles.btnPrimaryText}>Ambos</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Buscador y Pruebas */}
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionTitle}>Buscador y creación rápida</Text>
                  <TextInput
                    style={styles.input}
                    value={previewTitle}
                    onChangeText={setPreviewTitle}
                    placeholder="Título del anime..."
                    placeholderTextColor={adminColors.textSecondary}
                  />

                  <View style={styles.toolGrid}>
                    <TouchableOpacity
                      style={[styles.btnTool, !previewTitle && styles.btnDisabled]}
                      onPress={() => handleAction('findSlug')}
                      disabled={!previewTitle || !!loading}
                    >
                      <Text style={styles.btnToolText}>Slug JK</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnTool, !previewTitle && styles.btnDisabled]}
                      onPress={() => handleAction('findSlugAv1')}
                      disabled={!previewTitle || !!loading}
                    >
                      <Text style={styles.btnToolText}>Slug AV1</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnTool, !previewTitle && styles.btnDisabled]}
                      onPress={() => handleAction('previewAnilist')}
                      disabled={!previewTitle || !!loading}
                    >
                      <Text style={styles.btnToolText}>Prev. Anilist</Text>
                    </TouchableOpacity>
                  </View>

                  {slugResult !== undefined && (
                    <Text style={styles.resultLine}>
                      JK: <Text style={{ color: slugResult ? '#16a34a' : adminColors.primary }}>{slugResult || 'No'}</Text>
                    </Text>
                  )}
                  {slugAv1Result !== undefined && (
                    <Text style={styles.resultLine}>
                      AV1: <Text style={{ color: slugAv1Result ? '#16a34a' : adminColors.primary }}>{slugAv1Result || 'No'}</Text>
                    </Text>
                  )}
                  {previewData && (
                    <View style={styles.previewBox}>
                      <Text style={styles.previewText}>Título: {previewData.title}</Text>
                      <Text style={styles.previewText}>Rating: {previewData.rating}</Text>
                      <Text style={styles.previewText}>Episodios: {previewData.total_episodes}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary, { marginTop: 12 }, !previewTitle && styles.btnDisabled]}
                    onPress={() => handleAction('createAndScrape')}
                    disabled={!previewTitle || !!loading}
                  >
                    {loading === 'createAndScrape' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.btnPrimaryText}>Crear y scrapear desde título</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Acciones Masivas */}
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionTitle}>Acciones masivas</Text>
                  <Text style={styles.sectionDesc}>
                    Sincroniza episodios en emisión o recupera portadas faltantes por rango de IDs.
                  </Text>

                  <View style={[styles.formRow, { marginTop: 12 }]}>
                    <View style={styles.fieldHalf}>
                      <Text style={styles.label}>Desde ID (Opc.)</Text>
                      <TextInput
                        style={styles.input}
                        value={fixStartId}
                        onChangeText={setFixStartId}
                        placeholder="Ej: 903"
                        placeholderTextColor={adminColors.textSecondary}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.fieldHalf}>
                      <Text style={styles.label}>Hasta ID (Opc.)</Text>
                      <TextInput
                        style={styles.input}
                        value={fixEndId}
                        onChangeText={setFixEndId}
                        placeholder="Ej: 1064"
                        placeholderTextColor={adminColors.textSecondary}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnPrimary]}
                      onPress={() => handleAction('syncAiring')}
                      disabled={!!loading}
                    >
                      {loading === 'syncAiring' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.btnPrimaryText}>Sincronizar emisiones</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnSecondary]}
                      onPress={() => handleAction('fixImages')}
                      disabled={!!loading}
                    >
                      {loading === 'fixImages' ? (
                        <ActivityIndicator size="small" color={adminColors.text} />
                      ) : (
                        <Text style={styles.btnSecondaryText}>Corregir portadas</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Columna Derecha: Consola */}
              <View style={[styles.col, isWide && styles.rightCol]}>
                <TerminalLog jobs={jobs} connection={connection} />
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </AdminShell>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminColors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 36,
  },
  scrollContentCompact: {
    padding: 12,
    paddingBottom: 28,
  },
  pageInner: {
    width: '100%',
    maxWidth: 1160,
    alignSelf: 'center',
    gap: 16,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statTile: {
    flex: 1,
    minWidth: 100,
    backgroundColor: adminColors.surface,
    borderRadius: 4,
    padding: 14,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  statTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: adminColors.textSecondary,
    marginTop: 4,
  },
  mainGrid: {
    gap: 16,
  },
  mainGridWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  col: {
    width: '100%',
    gap: 16,
  },
  leftCol: {
    flex: 1.15,
    minWidth: 0,
  },
  rightCol: {
    flex: 1,
    minWidth: 0,
  },
  sectionBlock: {
    backgroundColor: adminColors.surface,
    borderRadius: 4,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: adminColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  sectionDesc: {
    fontSize: 13,
    color: adminColors.textSecondary,
    lineHeight: 19,
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  fieldSmall: {
    flex: 1,
    minWidth: 110,
  },
  fieldWide: {
    flex: 2,
    minWidth: 200,
  },
  fieldHalf: {
    flex: 1,
    minWidth: 140,
  },
  fieldThird: {
    flex: 1,
    minWidth: 96,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: adminColors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: adminColors.background,
    borderWidth: 1,
    borderColor: adminColors.border,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    color: adminColors.text,
    fontSize: 14,
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sourceBtn: {
    flex: 1,
    minWidth: 68,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminColors.background,
    borderWidth: 1,
    borderColor: adminColors.border,
    borderRadius: 4,
  },
  sourceBtnActive: {
    backgroundColor: 'rgba(117, 2, 15, 0.08)',
    borderColor: adminColors.primary,
  },
  sourceBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: adminColors.textSecondary,
  },
  sourceBtnTextActive: {
    color: adminColors.primary,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  btn: {
    flex: 1,
    minWidth: 110,
    minHeight: 46,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  btnPrimary: {
    backgroundColor: adminColors.primary,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  btnSecondary: {
    backgroundColor: adminColors.background,
    borderWidth: 1,
    borderColor: adminColors.border,
  },
  btnSecondaryText: {
    color: adminColors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  errorText: {
    marginTop: 10,
    color: adminColors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  successText: {
    marginTop: 10,
    color: '#16a34a',
    fontWeight: '700',
    fontSize: 13,
  },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  btnTool: {
    flex: 1,
    minWidth: 96,
    minHeight: 44,
    backgroundColor: adminColors.background,
    borderWidth: 1,
    borderColor: adminColors.border,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  btnToolText: {
    color: adminColors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  resultLine: {
    fontSize: 13,
    color: adminColors.textSecondary,
    marginTop: 8,
    fontWeight: '600',
  },
  previewBox: {
    marginTop: 10,
    padding: 12,
    backgroundColor: adminColors.background,
    borderRadius: 4,
    gap: 3,
  },
  previewText: {
    color: adminColors.text,
    fontSize: 12,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  terminalContainer: {
    backgroundColor: adminColors.ink,
    borderRadius: 4,
    overflow: 'hidden',
    height: 460,
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121014',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  terminalDots: {
    flexDirection: 'row',
    gap: 6,
    marginRight: 12,
  },
  terminalDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  terminalTitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '700',
  },
  terminalBody: {
    padding: 14,
  },
  terminalText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    marginBottom: 8,
  },
  terminalRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 5,
    flexWrap: 'wrap',
  },
  terminalTime: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  terminalSuccess: {
    color: '#4ade80',
    fontSize: 12,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  terminalError: {
    color: '#f87171',
    fontSize: 12,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  terminalActive: {
    color: '#facc15',
    fontSize: 12,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
})
