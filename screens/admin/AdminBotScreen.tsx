import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { AdminShell } from '../../components/admin/AdminShell'
import { adminApiService } from '../../services/adminApiService'
import { darkColors, typography } from '../../theme'

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

function TerminalLog({ jobs }: { jobs: BotJob[] }) {
  const scrollViewRef = useRef<ScrollView>(null);
  const activeJobs = jobs.filter(j => j.status === 'running')
  const finishedJobs = jobs.filter(j => j.status !== 'running')
  
  return (
    <View style={styles.terminalContainer}>
      <View style={styles.terminalHeader}>
        <View style={styles.terminalDots}>
          <View style={[styles.terminalDot, { backgroundColor: '#FF5F56' }]} />
          <View style={[styles.terminalDot, { backgroundColor: '#FFBD2E' }]} />
          <View style={[styles.terminalDot, { backgroundColor: '#27C93F' }]} />
        </View>
        <Text style={styles.terminalTitle}>pixel_scraper.exe</Text>
      </View>
      <ScrollView 
        ref={scrollViewRef}
        style={styles.terminalBody}
      >
        <Text style={styles.terminalText}>[System] Conectado al motor de scraping...</Text>

        {activeJobs.length > 0 && (
          <View style={styles.terminalRow}>
            <Text style={styles.terminalBlink}>_</Text>
          </View>
        )}

        {activeJobs.map(job => (
          <View key={job.id} style={styles.terminalRow}>
            <Text style={styles.terminalTime}>[{new Date().toLocaleTimeString()}]</Text>
            <Text style={styles.terminalActive}>
              {job.type === 'metadata' ? '[META]' : '[SCRAPE]'} ID {job.animeId} - {job.progress.message}... {job.progress.total > 0 ? `(${job.progress.current}/${job.progress.total})` : ''}
            </Text>
          </View>
        ))}
        
        {finishedJobs.map(job => (
          <View key={job.id} style={styles.terminalRow}>
            <Text style={styles.terminalTime}>[{new Date(job.finishedAt || job.startedAt).toLocaleTimeString()}]</Text>
            {job.status === 'done' ? (
              <Text style={styles.terminalSuccess}>
                {job.type === 'metadata' ? '[META]' : '[SCRAPE]'} ID {job.animeId} - {
                  job.type === 'metadata' 
                    ? `${job.result?.updated || 0} campos actualizados` 
                    : `${job.result?.inserted || 0} insertados, ${job.result?.updated || 0} act.`
                }
              </Text>
            ) : (
              <Text style={styles.terminalError}>
                {job.type === 'metadata' ? '[META]' : '[SCRAPE]'} ID {job.animeId} - ERROR: {job.errors?.[0] || 'Desconocido'}
              </Text>
            )}
          </View>
        ))}

      </ScrollView>
    </View>
  )
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconBox, { backgroundColor: color + '15', borderColor: color + '30' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statTitle}>{title}</Text>
      </View>
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
  const [fixStartId, setFixStartId] = useState('')
  const [fixEndId, setFixEndId] = useState('')
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
      } else if (action === 'fixImages') {
        const res = await adminApiService.axiosInstance.post('/api/admin/bot/fix-missing-images', {
          startId: fixStartId || undefined,
          endId: fixEndId || undefined
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
      } else if (action === 'previewAv1') {
        const res = await adminApiService.axiosInstance.post('/api/admin/bot/preview-av1', { slug: previewTitle })
        setPreviewAv1Data(res.data.data || null)
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

  const activeJobs = jobs.filter(j => j.status === 'running')
  const doneJobs = jobs.filter(j => j.status === 'done')
  const errorJobs = jobs.filter(j => j.status === 'error')

  return (
    <AdminShell activeKey="bot">
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header - Netflix Style */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="star" size={24} color="#FF0000" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Bot Inteligente</Text>
            <Text style={styles.headerSub}>Motor de Scraping & Metadatos</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.maxWidthContainer}>
            
            {/* Estadísticas */}
            <View style={styles.statsRow}>
              <StatCard title="En Progreso" value={activeJobs.length} icon="sync-outline" color="#3b82f6" />
              <StatCard title="Completados" value={doneJobs.length} icon="checkmark-done-outline" color="#22c55e" />
              <StatCard title="Errores" value={errorJobs.length} icon="warning-outline" color="#ef4444" />
            </View>

            <View style={styles.mainGrid}>
              
              {/* Columna Izquierda: Controles */}
              <View style={styles.leftCol}>
                
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="settings" size={18} color={darkColors.primary} />
                    <Text style={styles.cardTitle}>Configuración Manual</Text>
                  </View>
                  
                  <View style={styles.formGrid}>
                    <View style={styles.formRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>ID del Anime *</Text>
                        <TextInput
                          style={styles.input}
                          value={animeId}
                          onChangeText={setAnimeId}
                          placeholder="Ej: 42"
                          placeholderTextColor={darkColors.textGray}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={{ flex: 2 }}>
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
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Slug JKAnime (Opc.)</Text>
                        <TextInput
                          style={styles.input}
                          value={jkSlug}
                          onChangeText={setJkSlug}
                          placeholder="Ej: naruto"
                          placeholderTextColor={darkColors.textGray}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Slug AV1 (Opc.)</Text>
                        <TextInput
                          style={styles.input}
                          value={av1Slug}
                          onChangeText={setAv1Slug}
                          placeholder="Ej: naruto-shippuden"
                          placeholderTextColor={darkColors.textGray}
                        />
                      </View>
                    </View>

                    <View style={styles.formRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Desde Ep.</Text>
                        <TextInput
                          style={styles.input}
                          value={fromEp}
                          onChangeText={setFromEp}
                          keyboardType="numeric"
                          placeholder="1"
                          placeholderTextColor={darkColors.textGray}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Hasta Ep.</Text>
                        <TextInput
                          style={styles.input}
                          value={toEp}
                          onChangeText={setToEp}
                          keyboardType="numeric"
                          placeholder="Auto"
                          placeholderTextColor={darkColors.textGray}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Temporada</Text>
                        <TextInput
                          style={styles.input}
                          value={season}
                          onChangeText={setSeason}
                          keyboardType="numeric"
                          placeholder="1"
                          placeholderTextColor={darkColors.textGray}
                        />
                      </View>
                    </View>
                  </View>

                  {!!error && <Text style={styles.errorText}>{error}</Text>}
                  {!!successMsg && <Text style={styles.successText}>{successMsg}</Text>}

                  <View style={styles.actionGrid}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnSecondary, !animeId && styles.btnDisabled]}
                      onPress={() => handleAction('metadata')}
                      disabled={!animeId || !!loading}
                    >
                      {loading === 'metadata' ? (
                        <ActivityIndicator size="small" color={darkColors.text} />
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
                        <ActivityIndicator size="small" color={darkColors.text} />
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

                {/* Acciones Masivas */}
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="rocket" size={18} color={darkColors.primary} />
                    <Text style={styles.cardTitle}>Acciones Masivas</Text>
                  </View>
                  <Text style={styles.cardDesc}>
                    Ejecuta trabajos masivos como sincronización de episodios en emisión o 
                    recuperación automática de portadas faltantes.
                  </Text>
                  
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Desde ID (Opc.)</Text>
                      <TextInput
                        style={styles.input}
                        value={fixStartId}
                        onChangeText={setFixStartId}
                        placeholder="Ej: 903"
                        placeholderTextColor={darkColors.textGray}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Hasta ID (Opc.)</Text>
                      <TextInput
                        style={styles.input}
                        value={fixEndId}
                        onChangeText={setFixEndId}
                        placeholder="Ej: 1064"
                        placeholderTextColor={darkColors.textGray}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={{ gap: 12, marginTop: 12 }}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnPrimary]}
                      onPress={() => handleAction('syncAiring')}
                      disabled={!!loading}
                    >
                      {loading === 'syncAiring' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.btnPrimaryText}>Sincronizar Emisiones Actuales</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.btn, styles.btnSecondary]}
                      onPress={() => handleAction('fixImages')}
                      disabled={!!loading}
                    >
                      {loading === 'fixImages' ? (
                        <ActivityIndicator size="small" color={darkColors.text} />
                      ) : (
                        <Text style={styles.btnSecondaryText}>Corregir Imágenes Faltantes</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Herramientas Rápidas */}
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="search" size={18} color={darkColors.primary} />
                    <Text style={styles.cardTitle}>Buscador y Pruebas</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={previewTitle}
                    onChangeText={setPreviewTitle}
                    placeholder="Título del anime..."
                    placeholderTextColor={darkColors.textGray}
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
                      JK: <Text style={{ color: slugResult ? '#22c55e' : '#ef4444' }}>{slugResult || 'No'}</Text>
                    </Text>
                  )}
                  {slugAv1Result !== undefined && (
                    <Text style={styles.resultLine}>
                      AV1: <Text style={{ color: slugAv1Result ? '#22c55e' : '#ef4444' }}>{slugAv1Result || 'No'}</Text>
                    </Text>
                  )}
                  {previewData && (
                    <View style={styles.previewBox}>
                      <Text style={styles.previewText}>Title: {previewData.title}</Text>
                      <Text style={styles.previewText}>Rating: {previewData.rating}</Text>
                      <Text style={styles.previewText}>Eps: {previewData.total_episodes}</Text>
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
                      <Text style={styles.btnPrimaryText}>Crear & Scrapear (Desde Título)</Text>
                    )}
                  </TouchableOpacity>
                </View>

              </View>

              {/* Columna Derecha: Consola */}
              <View style={styles.rightCol}>
                <TerminalLog jobs={jobs} />
              </View>

            </View>

          </View>
        </ScrollView>
      </SafeAreaView>
    </AdminShell>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: darkColors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerIcon: {
    width: 48, height: 48, borderRadius: 0,
    backgroundColor: '#FF0000' + '20',
    borderWidth: 1, borderColor: '#FF0000',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: darkColors.text, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: darkColors.textGray, marginTop: 4 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  maxWidthContainer: {
    width: '100%',
    maxWidth: '100%', // El usuario dijo que había mucho espacio libre a los lados
    marginHorizontal: 'auto',
    alignSelf: 'center',
  },
  
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: darkColors.card,
    borderWidth: 1,
    borderColor: '#222',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statIconBox: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
    color: darkColors.text,
  },
  statTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: darkColors.textGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  mainGrid: {
    flexDirection: Platform.OS === 'web' && (window as any).innerWidth > 900 ? 'row' : 'column',
    gap: 24,
  },
  leftCol: {
    flex: 1.2, // Darle un poco más de espacio a los forms si es necesario, o al revés
    gap: 20,
  },
  rightCol: {
    flex: 1.8, // Para que el terminal (creaper) sea ancho
    minHeight: 500,
  },

  card: {
    backgroundColor: darkColors.card,
    borderWidth: 1,
    borderColor: '#222',
    padding: 24,
    borderRadius: 0, // Cuadrado puro
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    paddingBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: darkColors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardDesc: {
    fontSize: 13,
    color: darkColors.textGray,
    lineHeight: 20,
  },

  formGrid: {
    gap: 12,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  label: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: darkColors.textGray, 
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#0a0a0a', 
    borderWidth: 1,
    borderColor: '#333',
    padding: 14, // Inputs un poco más grandes
    color: darkColors.text, 
    fontSize: 14,
    borderRadius: 0, // Cuadrado puro
  },
  
  sourceRow: { flexDirection: 'row', gap: 6 },
  sourceBtn: {
    flex: 1, paddingVertical: 14, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#333',
    borderRadius: 0,
  },
  sourceBtnActive: { backgroundColor: darkColors.primary + '20', borderColor: darkColors.primary },
  sourceBtnText: { fontSize: 13, fontWeight: '700', color: darkColors.textGray },
  sourceBtnTextActive: { color: darkColors.primary },

  actionGrid: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btn: {
    flex: 1, paddingVertical: 18, paddingHorizontal: 12, // Botones muy grandes
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 0, // Cuadrado puro
  },
  btnPrimary: { backgroundColor: darkColors.primary },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14, textTransform: 'uppercase' },
  btnSecondary: { backgroundColor: '#1f1f1f', borderWidth: 1, borderColor: '#333' },
  btnSecondaryText: { color: darkColors.text, fontWeight: '700', fontSize: 14, textTransform: 'uppercase' },
  btnDisabled: { opacity: 0.4 },
  
  errorText: { marginTop: 12, color: '#ef4444', fontWeight: '700', fontSize: 13 },
  successText: { marginTop: 12, color: '#22c55e', fontWeight: '700', fontSize: 13 },

  toolGrid: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnTool: {
    flex: 1, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333',
    paddingVertical: 8, alignItems: 'center', justifyContent: 'center'
  },
  btnToolText: { color: darkColors.textGray, fontSize: 12, fontWeight: '600' },
  resultLine: { fontSize: 13, color: darkColors.textGray, marginTop: 8, fontWeight: '600' },
  previewBox: { marginTop: 12, padding: 12, backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#333' },
  previewText: { color: darkColors.textGray, fontSize: 12, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },

  // Terminal Styles
  terminalContainer: {
    flex: 1,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: '#333',
    height: 500,
    maxHeight: 500, // Fijar la altura máxima
    borderRadius: 0,
    shadowColor: darkColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  terminalDots: { flexDirection: 'row', gap: 6, marginRight: 16 },
  terminalDot: { width: 12, height: 12, borderRadius: 6 },
  terminalTitle: { color: '#666', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  terminalBody: {
    padding: 16,
  },
  terminalText: {
    color: '#666',
    fontSize: 13,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    marginBottom: 8,
  },
  terminalRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  terminalTime: {
    color: '#555',
    fontSize: 13,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  terminalSuccess: {
    color: '#22c55e',
    fontSize: 13,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  terminalError: {
    color: '#ef4444',
    fontSize: 13,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  terminalActive: {
    color: '#eab308',
    fontSize: 13,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  terminalBlink: {
    color: '#fff',
    fontSize: 13,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    opacity: 0.7,
  }
})
