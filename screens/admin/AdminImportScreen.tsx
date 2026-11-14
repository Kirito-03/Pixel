import { useAdminLayout } from '../../hooks/useAdminLayout';
import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import * as DocumentPicker from 'expo-document-picker'
import { AdminShell } from '../../components/admin/AdminShell'
import { AdminHeader } from '../../components/admin/AdminHeader'
import { adminApiService } from '../../services/adminApiService'
import { adminColors } from '../../theme'

type ValidateMode = 'mixed' | 'heuristic' | 'api'

function linesToArray(value: string) {
  return String(value || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

function StatMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricValue}>{value ?? 0}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

export default function AdminImportScreen() {
  const navigation = useNavigation()
  const { width, isWide, isCompact } = useAdminLayout()

  const [useDefaultM3u, setUseDefaultM3u] = useState(true)
  const [m3uSources, setM3uSources] = useState('')
  const [m3uText, setM3uText] = useState('')
  const [folders, setFolders] = useState('')
  const [maxItems, setMaxItems] = useState('600')
  const [maxTranscodes, setMaxTranscodes] = useState('25')
  const [validateMode, setValidateMode] = useState<ValidateMode>('mixed')
  const [enableTranscode, setEnableTranscode] = useState(false)
  const [allowNoEpisode, setAllowNoEpisode] = useState(false)

  const [runningAction, setRunningAction] = useState<'analyze' | 'import' | 'upload_text' | 'upload_file' | null>(null)
  const [result, setResult] = useState<any>(null)
  const [resultFilter, setResultFilter] = useState('')
  const [selectedAnimes, setSelectedAnimes] = useState<Set<string>>(new Set())
  const [jobsSummary, setJobsSummary] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  const payloadBase = useMemo(() => {
    const m3u = useDefaultM3u ? [] : linesToArray(m3uSources)
    const folderArr = linesToArray(folders)
    const mi = Number(maxItems) || undefined
    const mt = Number(maxTranscodes) || undefined
    return {
      m3u,
      folders: folderArr,
      validateMode,
      maxItems: mi,
      maxTranscodes: mt,
      allowNoEpisode,
      useDefaultM3u,
    }
  }, [allowNoEpisode, folders, m3uSources, maxItems, maxTranscodes, useDefaultM3u, validateMode])

  const filteredTopAnime = useMemo(() => {
    const list = result?.topAnime || []
    const q = resultFilter.trim().toLowerCase()
    if (!q) return list
    return list.filter((a: any) => String(a.title || '').toLowerCase().includes(q))
  }, [result, resultFilter])

  const refreshJobs = async () => {
    try {
      const s = await adminApiService.getImportJobsSummary()
      setJobsSummary(s.summary || null)
      const list = await adminApiService.getImportJobs({ limit: 40 })
      setJobs(Array.isArray(list.jobs) ? list.jobs : [])
    } catch {
    }
  }

  useEffect(() => {
    refreshJobs()
    const t = setInterval(refreshJobs, 2500)
    return () => clearInterval(t)
  }, [])

  const run = async (dryRun: boolean) => {
    setError(null)
    setRunningAction(dryRun ? 'analyze' : 'import')
    try {
      const payload = {
        ...payloadBase,
        dryRun,
        transcode: !dryRun && enableTranscode,
      } as any

      if (!dryRun && result?.topAnime) {
        payload.selectedTitles = Array.from(selectedAnimes)
      }

      const r = await adminApiService.importAnime(payload)
      setResult(r)
      if (dryRun && r.topAnime) {
        setSelectedAnimes(new Set(r.topAnime.map((a: any) => a.title)))
      }
      await refreshJobs()
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Error')
    } finally {
      setRunningAction(null)
    }
  }

  const uploadM3uText = async () => {
    setError(null)
    setRunningAction('upload_text')
    try {
      const r = await adminApiService.uploadM3uText({ content: m3uText, name: 'playlist.m3u' })
      const current = useDefaultM3u ? [] : linesToArray(m3uSources)
      current.push(r.url)
      setUseDefaultM3u(false)
      setM3uSources(current.join('\n') + '\n')
      setM3uText('')
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Error subiendo M3U')
    } finally {
      setRunningAction(null)
    }
  }

  const pickAndUploadM3uFile = async () => {
    setError(null)
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'audio/x-mpegurl', 'application/vnd.apple.mpegurl', '*/*'],
        multiple: false,
        copyToCacheDirectory: true,
      })

      if ((picked as any).canceled) return

      const asset = Array.isArray((picked as any).assets) ? (picked as any).assets[0] : (picked as any)
      const uri = asset?.uri
      const name = asset?.name || 'playlist.m3u'
      const mimeType = asset?.mimeType

      if (!uri) {
        throw new Error('No se seleccionó archivo')
      }

      const lower = String(name || uri).toLowerCase()
      if (!lower.endsWith('.m3u') && !lower.endsWith('.m3u8')) {
        throw new Error('Archivo no permitido. Usa .m3u o .m3u8.')
      }

      setRunningAction('upload_file')
      const r = await adminApiService.uploadM3uFile({ uri, name, mimeType })
      const current = useDefaultM3u ? [] : linesToArray(m3uSources)
      current.push(r.url)
      setUseDefaultM3u(false)
      setM3uSources(current.join('\n') + '\n')
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Error subiendo archivo M3U')
    } finally {
      setRunningAction(null)
    }
  }

  const toggleAnime = (title: string) => {
    const next = new Set(selectedAnimes)
    if (next.has(title)) next.delete(title)
    else next.add(title)
    setSelectedAnimes(next)
  }

  const toggleAllAnimes = () => {
    if (!result?.topAnime) return
    if (selectedAnimes.size === result.topAnime.length) {
      setSelectedAnimes(new Set())
    } else {
      setSelectedAnimes(new Set(result.topAnime.map((a: any) => a.title)))
    }
  }

  const retryJob = async (id: number) => {
    try {
      await adminApiService.retryImportJob(id)
      await refreshJobs()
    } catch {
    }
  }

  return (
    <AdminShell activeKey="import">
      <SafeAreaView style={styles.container} edges={['top']}>
        <AdminHeader
          title="Importar"
          subtitle="Listas M3U: analiza, selecciona y procesa"
          onBack={() => (navigation as any).goBack()}
        />

        <ScrollView contentContainerStyle={[styles.scrollContent, isCompact && styles.scrollContentCompact]}>
          <View style={[styles.importShortcut, { maxWidth: 1160, alignSelf: 'center', width: '100%', marginBottom: 20 }]}>
            <Text style={styles.sectionTitle}>¿Quieres añadir un anime por su título?</Text>
            <Text style={[styles.toggleText, { marginBottom: 12 }]}>Usa Smart Bot para buscar el título y gestionar sus capítulos. Esta pantalla importa listas M3U.</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Buscar anime en Smart Bot" style={styles.btnSmallOutline} onPress={() => (navigation as any).navigate('AdminBot')}>
              <Text style={styles.btnSmallOutlineText}>Abrir Smart Bot</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.pageInner, isWide && styles.pageInnerWide]}>
            {/* Columna 1: Fuentes y Configuración */}
            <View style={[styles.col, isWide && styles.colLeft]}>
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>1. Fuentes M3U y carpetas</Text>

                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => setUseDefaultM3u((v) => !v)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={useDefaultM3u ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={useDefaultM3u ? adminColors.primary : adminColors.textSecondary}
                  />
                  <Text style={styles.toggleText}>Usar M3U por defecto del servidor</Text>
                </TouchableOpacity>

                {!useDefaultM3u && (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>URLs o rutas M3U (una por línea)</Text>
                    <TextInput
                      value={m3uSources}
                      onChangeText={setM3uSources}
                      placeholder="https://example.com/lista.m3u"
                      placeholderTextColor={adminColors.textSecondary}
                      style={[styles.input, styles.textarea]}
                      multiline
                    />
                  </View>
                )}

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Subir contenido M3U (se guarda 7 días)</Text>
                  <TextInput
                    value={m3uText}
                    onChangeText={setM3uText}
                    placeholder="#EXTM3U..."
                    placeholderTextColor={adminColors.textSecondary}
                    style={[styles.input, styles.textareaSm]}
                    multiline
                  />
                  <View style={styles.inlineBtns}>
                    <TouchableOpacity
                      style={[styles.btnSmallDark, (!m3uText.trim() || !!runningAction) && styles.btnDisabled]}
                      onPress={uploadM3uText}
                      disabled={!m3uText.trim() || !!runningAction}
                      activeOpacity={0.9}
                    >
                      {runningAction === 'upload_text' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.btnSmallDarkText}>Subir texto M3U</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnSmallOutline, !!runningAction && styles.btnDisabled]}
                      onPress={pickAndUploadM3uFile}
                      disabled={!!runningAction}
                      activeOpacity={0.9}
                    >
                      {runningAction === 'upload_file' ? (
                        <ActivityIndicator size="small" color={adminColors.text} />
                      ) : (
                        <Text style={styles.btnSmallOutlineText}>Archivo .m3u</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Carpetas locales (una por línea)</Text>
                  <TextInput
                    value={folders}
                    onChangeText={setFolders}
                    placeholder="c:\path\videos"
                    placeholderTextColor={adminColors.textSecondary}
                    style={[styles.input, styles.textareaSm]}
                    multiline
                  />
                </View>

                <View style={styles.divider} />

                <Text style={styles.sectionTitle}>2. Configuración</Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Validación</Text>
                  <View style={styles.chipsRow}>
                    {(['mixed', 'heuristic', 'api'] as ValidateMode[]).map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.chip, validateMode === m && styles.chipActive]}
                        onPress={() => setValidateMode(m)}
                        activeOpacity={0.88}
                      >
                        <Text style={[styles.chipText, validateMode === m && styles.chipTextActive]}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.rowCol}>
                    <Text style={styles.label}>Max items</Text>
                    <TextInput
                      value={maxItems}
                      onChangeText={setMaxItems}
                      style={styles.input}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={styles.rowCol}>
                    <Text style={styles.label}>Max transcodes</Text>
                    <TextInput
                      value={maxTranscodes}
                      onChangeText={setMaxTranscodes}
                      style={styles.input}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>

                <View style={styles.togglesList}>
                  <TouchableOpacity
                    style={styles.toggleRow}
                    onPress={() => setEnableTranscode((v) => !v)}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={enableTranscode ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={enableTranscode ? adminColors.primary : adminColors.textSecondary}
                    />
                    <Text style={styles.toggleText}>Transcodificar con el flujo HLS/R2 (opcional)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.toggleRow}
                    onPress={() => setAllowNoEpisode((v) => !v)}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={allowNoEpisode ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={allowNoEpisode ? adminColors.primary : adminColors.textSecondary}
                    />
                    <Text style={styles.toggleText}>Aceptar sin episodio</Text>
                  </TouchableOpacity>
                </View>

                {!!error && <Text style={styles.errorText}>{error}</Text>}

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnSecondary, !!runningAction && styles.btnDisabled]}
                    onPress={() => run(true)}
                    disabled={!!runningAction}
                    activeOpacity={0.9}
                  >
                    {runningAction === 'analyze' ? (
                      <ActivityIndicator color={adminColors.text} />
                    ) : (
                      <Text style={styles.btnSecondaryText}>Analizar</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary, !!runningAction && styles.btnDisabled]}
                    onPress={() => run(false)}
                    disabled={!!runningAction}
                    activeOpacity={0.9}
                  >
                    {runningAction === 'import' ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.btnPrimaryText}>Importar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Columna 2: Resultados, Selección y Cola */}
            <View style={[styles.col, isWide && styles.colRight]}>
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>3. Resultados y selección</Text>
                {!result ? (
                  <Text style={styles.muted}>Ejecuta "Analizar" para previsualizar y seleccionar títulos antes de importar.</Text>
                ) : (
                  <>
                    <View style={styles.metricsRow}>
                      <StatMetric label="Scanned" value={result.scanned} />
                      <StatMetric label="Accepted" value={result.accepted} />
                      <StatMetric label="Anime" value={result.importedAnime} />
                      <StatMetric label="Eps" value={result.importedEpisodes} />
                      <StatMetric label="Enqueue" value={result.transcoded} />
                    </View>

                    <View style={styles.selectionHeader}>
                      <Text style={styles.selectionCount}>
                        Títulos ({selectedAnimes.size}/{result.topAnime?.length || 0})
                      </Text>
                      <TouchableOpacity onPress={toggleAllAnimes} style={styles.textLinkBtn}>
                        <Text style={styles.textLink}>
                          {selectedAnimes.size === result.topAnime?.length ? 'Desmarcar todos' : 'Marcar todos'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {(result.topAnime?.length || 0) > 6 && (
                      <View style={styles.filterBox}>
                        <Ionicons name="search" size={16} color={adminColors.textSecondary} />
                        <TextInput
                          value={resultFilter}
                          onChangeText={setResultFilter}
                          placeholder="Filtrar títulos detectados..."
                          placeholderTextColor={adminColors.textSecondary}
                          style={styles.filterInput}
                        />
                        {!!resultFilter && (
                          <TouchableOpacity onPress={() => setResultFilter('')} style={styles.clearBtn}>
                            <Ionicons name="close-circle" size={18} color={adminColors.textSecondary} />
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    <View style={styles.resultsListWrap}>
                      <ScrollView nestedScrollEnabled style={styles.resultsScroll}>
                        {filteredTopAnime.map((it: any, idx: number) => {
                          const isSelected = selectedAnimes.has(it.title)
                          return (
                            <TouchableOpacity
                              key={it.title}
                              style={[
                                styles.resultRow,
                                idx > 0 && styles.rowDivider,
                                !isSelected && styles.resultRowUnselected,
                              ]}
                              onPress={() => toggleAnime(it.title)}
                              activeOpacity={0.75}
                            >
                              <Ionicons
                                name={isSelected ? 'checkbox' : 'square-outline'}
                                size={20}
                                color={isSelected ? adminColors.primary : adminColors.textSecondary}
                              />
                              <Text style={styles.itemTitle} numberOfLines={1}>{it.title}</Text>
                              <Text style={styles.itemCount}>{it.count}</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </ScrollView>
                    </View>
                  </>
                )}
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>4. Cola de procesamiento</Text>
                <Text style={styles.queueSummary}>
                  En cola: {jobsSummary?.queued || 0} · Procesando: {jobsSummary?.processing || 0} · Listos: {jobsSummary?.done || 0} · Error: {jobsSummary?.error || 0}
                </Text>

                {jobs.length === 0 ? (
                  <Text style={[styles.muted, { marginTop: 8 }]}>No hay trabajos recientes en la cola.</Text>
                ) : (
                  <View style={styles.jobsList}>
                    {jobs.slice(0, 12).map((j: any, idx: number) => (
                      <View key={j.id} style={[styles.jobRow, idx > 0 && styles.rowDivider]}>
                        <View style={styles.jobMain}>
                          <Text style={styles.jobTitle}>#{j.id} · ep {j.episode_id}</Text>
                          <Text style={styles.jobMeta}>{j.status} · intentos {j.attempts}</Text>
                          {!!j.last_error && j.status === 'error' && (
                            <Text style={styles.jobError} numberOfLines={3}>
                              {String(j.last_error)}
                            </Text>
                          )}
                        </View>
                        {j.status === 'error' && (
                          <TouchableOpacity
                            style={styles.retryBtn}
                            onPress={() => retryJob(Number(j.id))}
                            activeOpacity={0.88}
                          >
                            <Text style={styles.retryBtnText}>Reintentar</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </AdminShell>
  )
}

const styles = StyleSheet.create({
  importShortcut: { paddingVertical: 8, alignItems: 'flex-start' },
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
  pageInnerWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  col: {
    width: '100%',
    gap: 16,
  },
  colLeft: {
    flex: 1,
    minWidth: 0,
  },
  colRight: {
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
  divider: {
    height: 1,
    backgroundColor: adminColors.border,
    marginVertical: 16,
  },
  fieldGroup: {
    marginTop: 12,
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
  textarea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  textareaSm: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  inlineBtns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  btnSmallDark: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 4,
    backgroundColor: adminColors.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSmallDarkText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  btnSmallOutline: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 4,
    backgroundColor: adminColors.background,
    borderWidth: 1,
    borderColor: adminColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSmallOutlineText: {
    color: adminColors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: adminColors.border,
    backgroundColor: adminColors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipActive: {
    borderColor: adminColors.primary,
    backgroundColor: 'rgba(117, 2, 15, 0.08)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: adminColors.textSecondary,
    textTransform: 'uppercase',
  },
  chipTextActive: {
    color: adminColors.primary,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  rowCol: {
    flex: 1,
    minWidth: 140,
  },
  togglesList: {
    marginTop: 12,
    gap: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 6,
  },
  toggleText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: adminColors.text,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  btn: {
    flex: 1,
    minWidth: 130,
    minHeight: 48,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnPrimary: {
    backgroundColor: adminColors.primary,
  },
  btnSecondary: {
    backgroundColor: adminColors.background,
    borderWidth: 1,
    borderColor: adminColors.border,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  btnSecondaryText: {
    color: adminColors.text,
    fontWeight: '800',
    fontSize: 14,
  },
  errorText: {
    marginTop: 12,
    color: adminColors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  muted: {
    color: adminColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  metricTile: {
    flex: 1,
    minWidth: 80,
    backgroundColor: adminColors.background,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: adminColors.text,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: adminColors.textSecondary,
    marginTop: 2,
  },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  selectionCount: {
    fontSize: 13,
    fontWeight: '800',
    color: adminColors.text,
  },
  textLinkBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  textLink: {
    color: adminColors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  filterBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: adminColors.background,
    borderWidth: 1,
    borderColor: adminColors.border,
    borderRadius: 4,
    paddingHorizontal: 12,
    minHeight: 44,
    marginBottom: 10,
  },
  filterInput: {
    flex: 1,
    minWidth: 0,
    color: adminColors.text,
    fontSize: 14,
  },
  clearBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsListWrap: {
    maxHeight: 320,
    backgroundColor: adminColors.background,
    borderRadius: 4,
    overflow: 'hidden',
  },
  resultsScroll: {
    maxHeight: 320,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resultRowUnselected: {
    opacity: 0.55,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: adminColors.border,
  },
  itemTitle: {
    flex: 1,
    minWidth: 0,
    color: adminColors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  itemCount: {
    color: adminColors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  queueSummary: {
    fontSize: 12,
    fontWeight: '600',
    color: adminColors.textSecondary,
    marginBottom: 8,
  },
  jobsList: {
    marginTop: 6,
    backgroundColor: adminColors.background,
    borderRadius: 4,
    overflow: 'hidden',
  },
  jobRow: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  jobMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  jobTitle: {
    color: adminColors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  jobMeta: {
    color: adminColors.textSecondary,
    fontWeight: '600',
    fontSize: 12,
  },
  jobError: {
    color: adminColors.secondary,
    fontSize: 12,
    marginTop: 4,
  },
  retryBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 4,
    backgroundColor: adminColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
})
