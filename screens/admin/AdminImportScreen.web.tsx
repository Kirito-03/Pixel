import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { AdminShell } from '../../components/admin/AdminShell'
import { adminApiService } from '../../services/adminApiService'
import { adminColors } from '../../theme'

type ValidateMode = 'mixed' | 'heuristic' | 'api'

function linesToArray(value: string) {
  return String(value || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={styles.pillValue}>{value}</Text>
    </View>
  )
}

export default function AdminImportScreen() {
  const navigation = useNavigation()
  const [useDefaultM3u, setUseDefaultM3u] = useState(true)
  const [m3uSources, setM3uSources] = useState('')
  const [m3uText, setM3uText] = useState('')
  const [maxItems, setMaxItems] = useState('600')
  const [maxTranscodes, setMaxTranscodes] = useState('25')
  const [validateMode, setValidateMode] = useState<ValidateMode>('mixed')
  const [enableTranscode, setEnableTranscode] = useState(true)
  const [allowNoEpisode, setAllowNoEpisode] = useState(false)
  const [runningAction, setRunningAction] = useState<'analyze' | 'import' | 'upload_text' | 'upload_file' | null>(null)
  const [result, setResult] = useState<any>(null)
  const [selectedAnimes, setSelectedAnimes] = useState<Set<string>>(new Set())
  const [jobsSummary, setJobsSummary] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([])

  const fetchUploadedFiles = async () => {
    try {
      const res = await adminApiService.getUploadedM3uFiles()
      if (res.ok && res.files) {
        setUploadedFiles(res.files)
      }
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => {
    fetchUploadedFiles()
  }, [])

  const payloadBase = useMemo(() => {
    const m3u = useDefaultM3u ? [] : linesToArray(m3uSources)
    const mi = Number(maxItems) || undefined
    const mt = Number(maxTranscodes) || undefined
    return {
      m3u,
      validateMode,
      maxItems: mi,
      maxTranscodes: mt,
      allowNoEpisode,
      useDefaultM3u,
    }
  }, [allowNoEpisode, m3uSources, maxItems, maxTranscodes, useDefaultM3u, validateMode])

  const refreshJobs = async () => {
    try {
      const s = await adminApiService.getImportJobsSummary()
      setJobsSummary(s.summary || null)
      const list = await adminApiService.getImportJobs({ limit: 40 })
      setJobs(Array.isArray(list.jobs) ? list.jobs : [])
      return true
    } catch {
      return false
    }
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let interval = 8000 // Base: 8 segundos
    const MAX_INTERVAL = 30000

    const tick = async () => {
      const ok = await refreshJobs()
      if (ok) {
        interval = 8000 // Reset en éxito
      } else {
        interval = Math.min(interval * 1.5, MAX_INTERVAL) // Backoff en error
      }
      timer = setTimeout(tick, interval)
    }

    tick()
    return () => clearTimeout(timer)
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
      fetchUploadedFiles()
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Error subiendo M3U')
    } finally {
      setRunningAction(null)
    }
  }

  const pickAndUploadM3uFile = async () => {
    setError(null)
    try {
      const doc = (globalThis as any).document
      if (!doc) {
        throw new Error('Selector de archivos no disponible')
      }

      const input = doc.createElement('input')
      input.type = 'file'
      input.accept = '.m3u,.m3u8'

      const file = await new Promise<any>((resolve) => {
        input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null)
        input.click()
      })

      if (!file) return

      const name = String(file.name || '').toLowerCase()
      if (!name.endsWith('.m3u') && !name.endsWith('.m3u8')) {
        throw new Error('Archivo no permitido. Usa .m3u o .m3u8.')
      }

      setRunningAction('upload_file')
      const r = await adminApiService.uploadM3uFile(file)
      const current = useDefaultM3u ? [] : linesToArray(m3uSources)
      current.push(r.url)
      setUseDefaultM3u(false)
      setM3uSources(current.join('\n') + '\n')
      fetchUploadedFiles()
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
        <View style={styles.header}>
          {Platform.OS !== 'web' && (
            <TouchableOpacity onPress={() => (navigation as any).goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color={adminColors.text} />
            </TouchableOpacity>
          )}
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Importar</Text>
            <Text style={styles.headerMeta}>M3U y carpetas → catálogo + cola</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Fuentes</Text>

            <TouchableOpacity style={styles.toggleRow} onPress={() => setUseDefaultM3u((v) => !v)} activeOpacity={0.9}>
              <View style={[styles.toggleDot, useDefaultM3u && styles.toggleDotOn]} />
              <Text style={styles.toggleText}>Usar M3U por defecto del servidor</Text>
            </TouchableOpacity>

            {!useDefaultM3u && (
              <>
                <Text style={styles.label}>M3U (uno por línea: URL https o ruta en el servidor)</Text>
                <TextInput
                  value={m3uSources}
                  onChangeText={setM3uSources}
                  placeholder="https://example.com/lista.m3u"
                  placeholderTextColor={adminColors.textSecondary}
                  style={[styles.input, styles.textarea]}
                  multiline
                />
              </>
            )}

            <Text style={styles.label}>Pegar contenido M3U (se sube y se guarda 7 días)</Text>
            <TextInput
              value={m3uText}
              onChangeText={setM3uText}
              placeholder="#EXTM3U..."
              placeholderTextColor={adminColors.textSecondary}
              style={[styles.input, styles.textareaSm]}
              multiline
            />
            <TouchableOpacity
              style={[styles.btnInline, !m3uText.trim() && styles.btnInlineDisabled]}
              onPress={uploadM3uText}
              disabled={!m3uText.trim() || !!runningAction}
              activeOpacity={0.92}
            >
              {runningAction === 'upload_text' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnInlineText}>Subir M3U</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnInlineSecondary, !!runningAction && styles.btnInlineDisabled]}
              onPress={pickAndUploadM3uFile}
              disabled={!!runningAction}
              activeOpacity={0.92}
            >
              {runningAction === 'upload_file' ? <ActivityIndicator size="small" color={adminColors.text} /> : <Text style={styles.btnInlineSecondaryText}>Buscar archivo .m3u</Text>}
            </TouchableOpacity>

            {uploadedFiles.length > 0 && (
              <View style={{ marginTop: 20 }}>
                <Text style={styles.label}>Archivos Subidos (Click para agregar)</Text>
                <View style={{ gap: 8, marginTop: 8 }}>
                  {uploadedFiles.map((file, i) => (
                    <TouchableOpacity
                      key={i}
                      style={{ padding: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, borderWidth: 1, borderColor: adminColors.border }}
                      onPress={() => {
                        const current = useDefaultM3u ? [] : linesToArray(m3uSources)
                        current.push(file.url)
                        setUseDefaultM3u(false)
                        setM3uSources(current.join('\n') + '\n')
                      }}
                    >
                      <Text style={{ color: adminColors.text, fontWeight: 'bold' }}>{file.name}</Text>
                      <Text style={{ color: adminColors.textSecondary, fontSize: 12, marginTop: 4 }}>
                        {new Date(file.createdAt).toLocaleString()} · {(file.size / 1024).toFixed(1)} KB
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.row}>
              <View style={styles.rowCol}>
                <Text style={styles.label}>Validación</Text>
                <View style={styles.chipsRow}>
                  {(['mixed', 'heuristic', 'api'] as ValidateMode[]).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.chip, validateMode === m && styles.chipActive]}
                      onPress={() => setValidateMode(m)}
                      activeOpacity={0.92}
                    >
                      <Text style={[styles.chipText, validateMode === m && styles.chipTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.rowCol}>
                <Text style={styles.label}>Max items</Text>
                <TextInput value={maxItems} onChangeText={setMaxItems} style={styles.input} keyboardType="number-pad" />
              </View>
              <View style={styles.rowCol}>
                <Text style={styles.label}>Max transcodes</Text>
                <TextInput value={maxTranscodes} onChangeText={setMaxTranscodes} style={styles.input} keyboardType="number-pad" />
              </View>
            </View>

            <View style={styles.row}>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setEnableTranscode((v) => !v)} activeOpacity={0.9}>
                <View style={[styles.toggleDot, enableTranscode && styles.toggleDotOn]} />
                <Text style={styles.toggleText}>Encolar transcode (HLS/R2)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setAllowNoEpisode((v) => !v)} activeOpacity={0.9}>
                <View style={[styles.toggleDot, allowNoEpisode && styles.toggleDotOn]} />
                <Text style={styles.toggleText}>Aceptar sin episodio</Text>
              </TouchableOpacity>
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.actionsRow}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => run(true)} disabled={!!runningAction} activeOpacity={0.92}>
                {runningAction === 'analyze' ? <ActivityIndicator color={adminColors.text} /> : <Text style={styles.btnSecondaryText}>Analizar</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => run(false)} disabled={!!runningAction} activeOpacity={0.92}>
                {runningAction === 'import' ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Importar</Text>}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Resultado</Text>
            {!result ? (
              <Text style={styles.muted}>Sin ejecutar</Text>
            ) : (
              <>
                <View style={styles.pillsRow}>
                  <StatPill label="Scanned" value={result.scanned} />
                  <StatPill label="Accepted" value={result.accepted} />
                  <StatPill label="Anime" value={result.importedAnime} />
                  <StatPill label="Eps" value={result.importedEpisodes} />
                  <StatPill label="Enqueue" value={result.transcoded} />
                </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                      Titulos detectados ({selectedAnimes.size}/{result.topAnime?.length || 0})
                    </Text>
                    <TouchableOpacity onPress={toggleAllAnimes}>
                      <Text style={{ color: adminColors.primary, fontSize: 13, fontWeight: 'bold' }}>
                        {selectedAnimes.size === result.topAnime?.length ? 'Desmarcar todos' : 'Marcar todos'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ maxHeight: 300 }}>
                    <ScrollView nestedScrollEnabled contentContainerStyle={{ paddingRight: 8 }}>
                      {(result.topAnime || []).map((it: any) => {
                        const isSelected = selectedAnimes.has(it.title)
                        return (
                          <TouchableOpacity 
                            key={it.title} 
                            style={[styles.itemRow, { opacity: isSelected ? 1 : 0.5 }]}
                            onPress={() => toggleAnime(it.title)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.toggleDot, isSelected && styles.toggleDotOn, { marginRight: 10 }]} />
                            <Text style={[styles.itemTitle, { flex: 1 }]} numberOfLines={1}>{it.title}</Text>
                            <Text style={styles.itemCount}>{it.count}</Text>
                          </TouchableOpacity>
                        )
                      })}
                    </ScrollView>
                  </View>
                </>
              )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cola</Text>
            <Text style={styles.muted}>
              queued: {jobsSummary?.queued || 0} · processing: {jobsSummary?.processing || 0} · done: {jobsSummary?.done || 0} · error: {jobsSummary?.error || 0}
            </Text>
            {(jobs || []).slice(0, 12).map((j: any) => (
              <View key={j.id} style={styles.jobRow}>
                <View style={styles.jobMain}>
                  <Text style={styles.jobTitle}>#{j.id} · ep {j.episode_id}</Text>
                  <Text style={styles.jobMeta}>{j.status} · attempts {j.attempts}</Text>
                  {!!j.last_error && j.status === 'error' && (
                    <Text style={styles.jobError} numberOfLines={3}>
                      {String(j.last_error)}
                    </Text>
                  )}
                </View>
                {j.status === 'error' && (
                  <TouchableOpacity style={styles.retryBtn} onPress={() => retryJob(Number(j.id))} activeOpacity={0.92}>
                    <Text style={styles.retryBtnText}>Reintentar</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: adminColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: adminColors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: adminColors.background,
    borderWidth: 1,
    borderColor: adminColors.border,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: adminColors.text,
  },
  headerMeta: {
    fontSize: 12,
    color: adminColors.textSecondary,
    marginTop: 2,
  },
  content: {
    padding: 16,
    paddingBottom: 30,
    gap: 12,
  },
  card: {
    backgroundColor: adminColors.surface,
    borderWidth: 1,
    borderColor: adminColors.border,
    borderRadius: 14,
    padding: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: adminColors.text,
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: adminColors.textSecondary,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: adminColors.background,
    borderWidth: 1,
    borderColor: adminColors.border,
    borderRadius: 12,
    padding: 12,
    color: adminColors.text,
    fontSize: 14,
  },
  textarea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  textareaSm: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  btnInline: {
    marginTop: 10,
    backgroundColor: adminColors.ink,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnInlineDisabled: {
    opacity: 0.5,
  },
  btnInlineText: {
    color: '#fff',
    fontWeight: '900',
  },
  btnInlineSecondary: {
    marginTop: 10,
    backgroundColor: adminColors.background,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: adminColors.border,
  },
  btnInlineSecondaryText: {
    color: adminColors.text,
    fontWeight: '900',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: adminColors.border,
    backgroundColor: adminColors.surface,
  },
  chipActive: {
    borderColor: 'rgba(117, 2, 15, 0.40)',
    backgroundColor: 'rgba(117, 2, 15, 0.08)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
    color: adminColors.textSecondary,
    textTransform: 'uppercase',
  },
  chipTextActive: {
    color: adminColors.primary,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 10,
  },
  rowCol: {
    flex: 1,
    minWidth: 160,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  toggleDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: adminColors.border,
    backgroundColor: adminColors.surface,
  },
  toggleDotOn: {
    backgroundColor: adminColors.primary,
    borderColor: adminColors.primary,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: adminColors.text,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#fff',
    fontWeight: '900',
  },
  btnSecondaryText: {
    color: adminColors.text,
    fontWeight: '900',
  },
  errorText: {
    marginTop: 10,
    color: adminColors.secondary,
    fontWeight: '800',
  },
  muted: {
    color: adminColors.textSecondary,
    fontWeight: '700',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: adminColors.border,
    backgroundColor: adminColors.background,
  },
  pillLabel: {
    fontSize: 10,
    color: adminColors.textSecondary,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  pillValue: {
    fontSize: 13,
    color: adminColors.text,
    fontWeight: '900',
    marginTop: 2,
  },
  sectionTitle: {
    marginTop: 12,
    fontWeight: '900',
    color: adminColors.text,
  },
  itemRow: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: adminColors.border,
    borderRadius: 12,
    backgroundColor: adminColors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemTitle: {
    flex: 1,
    minWidth: 0,
    fontWeight: '800',
    color: adminColors.text,
  },
  itemCount: {
    fontWeight: '900',
    color: adminColors.primary,
  },
  jobRow: {
    marginTop: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: adminColors.border,
    borderRadius: 12,
    backgroundColor: adminColors.background,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  jobMain: {
    flex: 1,
    minWidth: 0,
  },
  jobTitle: {
    fontWeight: '900',
    color: adminColors.text,
  },
  jobMeta: {
    marginTop: 4,
    color: adminColors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  jobError: {
    marginTop: 6,
    color: adminColors.secondary,
    fontWeight: '700',
    fontSize: 12,
  },
  retryBtn: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(117, 2, 15, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(117, 2, 15, 0.25)',
  },
  retryBtnText: {
    fontWeight: '900',
    color: adminColors.primary,
  },
})

