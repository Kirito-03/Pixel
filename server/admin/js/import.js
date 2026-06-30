function el(id) {
    return document.getElementById(id);
}

function showError(message) {
    const box = el('run-error');
    if (!box) return;
    box.textContent = message;
    box.style.display = 'block';
}

function clearError() {
    const box = el('run-error');
    if (!box) return;
    box.textContent = '';
    box.style.display = 'none';
}

function linesToArray(value) {
    return String(value || '')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
}

function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
}

function setLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
        btn.classList.add('loading-state');
    } else {
        btn.classList.remove('loading-state');
    }
}

// State
let lastAnalysis = null; // { topAnime, samples, stats }
let currentAbortController = null;

function renderStats(result) {
    const container = el('import-stats');
    if (!container) return;
    const items = [
        { label: 'Scanned', val: result.scanned },
        { label: 'Accepted', val: result.accepted, accent: true },
        { label: 'Anime', val: result.topAnime?.length || 0 },
        { label: 'Eps', val: result.importedEpisodes || 0 },
        { label: 'Enqueue', val: result.transcoded || 0 },
        { label: 'Skipped', val: result.skippedNotAnime || 0 },
        { label: 'Errors', val: result.errors || 0 },
    ];
    container.innerHTML = items.map(it =>
        `<div class="import-stat">
            <div class="label">${it.label}</div>
            <div class="val${it.accent ? ' accent' : ''}">${it.val}</div>
        </div>`
    ).join('');
}

function renderAnimeList(animeList) {
    const container = el('anime-check-list');
    if (!container) return;

    if (!animeList || !animeList.length) {
        container.innerHTML = '<div style="padding:24px; text-align:center; color: var(--text-secondary);">Sin resultados</div>';
        updateSelectedCount();
        return;
    }

    container.innerHTML = animeList.map((it, i) =>
        `<label class="anime-check-item" data-title="${it.title.replace(/"/g, '&quot;')}" data-index="${i}">
            <input type="checkbox" checked />
            <span class="title">${it.title}</span>
            <span class="ep-count">${it.count}</span>
        </label>`
    ).join('');

    updateSelectedCount();
}

function updateSelectedCount() {
    const checks = document.querySelectorAll('#anime-check-list input[type="checkbox"]');
    const checked = document.querySelectorAll('#anime-check-list input[type="checkbox"]:checked');
    const countEl = el('selected-count');
    if (countEl) countEl.textContent = `${checked.length} / ${checks.length} seleccionados`;

    const importBtn = el('import-btn');
    if (importBtn) importBtn.disabled = checked.length === 0;
}

function getSelectedTitles() {
    const items = document.querySelectorAll('#anime-check-list .anime-check-item');
    const selected = [];
    items.forEach(item => {
        const cb = item.querySelector('input[type="checkbox"]');
        if (cb && cb.checked) {
            selected.push(item.getAttribute('data-title'));
        }
    });
    return selected;
}

function filterAnimeList(query) {
    const items = document.querySelectorAll('#anime-check-list .anime-check-item');
    const q = (query || '').toLowerCase();
    items.forEach(item => {
        const title = (item.getAttribute('data-title') || '').toLowerCase();
        item.style.display = !q || title.includes(q) ? '' : 'none';
    });
}

function renderSamples(samples) {
    const container = el('samples');
    if (!container) return;
    if (!samples || !samples.length) {
        container.innerHTML = '<div style="color: var(--text-secondary);">—</div>';
        return;
    }
    container.innerHTML = samples.map(it => {
        const se = it.episode ? `S${String(it.season || 1).padStart(2, '0')}E${String(it.episode).padStart(2, '0')}` : '—';
        return `<div class="sample-card">
            <div class="s-title">${it.title}</div>
            <div class="s-meta">${se} · score ${(Number(it.score || 0) * 100).toFixed(0)}%</div>
        </div>`;
    }).join('');
}

async function runAnalysis() {
    clearError();
    const analyzeBtn = el('analyze-btn');
    const importBtn = el('import-btn');
    const stopBtn = el('stop-btn');
    setLoading(analyzeBtn, true);
    setLoading(importBtn, true);
    if (stopBtn) stopBtn.style.display = 'flex';

    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();

    try {
        const sources = linesToArray(el('m3u-sources')?.value);
        const validateMode = el('validate-mode')?.value || 'mixed';
        const maxItems = Number(el('max-items')?.value || 0) || undefined;
        const maxTranscodes = Number(el('max-transcodes')?.value || 0) || undefined;
        const allowNoEpisode = !!el('allow-no-episode')?.checked;

        const payload = {
            dryRun: true,
            transcode: false,
            validateMode,
            maxItems,
            maxTranscodes,
            allowNoEpisode,
            m3u: sources,
            folders: [],
        };

        const result = await api.importAnime(payload, currentAbortController.signal);
        lastAnalysis = result;

        // Show results
        const section = el('results-section');
        if (section) section.classList.add('visible');

        renderStats(result);
        renderAnimeList(result.topAnime || []);
        renderSamples(result.samples || []);

    } catch (e) {
        if (e.name === 'AbortError') {
            showError('Análisis detenido por el usuario');
        } else {
            showError(e?.message || 'Error al analizar');
        }
    } finally {
        setLoading(analyzeBtn, false);
        setLoading(importBtn, false);
        if (stopBtn) stopBtn.style.display = 'none';
        currentAbortController = null;
    }
}

async function runImport() {
    clearError();
    const selected = getSelectedTitles();
    if (!selected.length) {
        showError('Selecciona al menos un anime para importar');
        return;
    }

    const analyzeBtn = el('analyze-btn');
    const importBtn = el('import-btn');
    const stopBtn = el('stop-btn');
    setLoading(analyzeBtn, true);
    setLoading(importBtn, true);
    if (stopBtn) stopBtn.style.display = 'flex';

    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();

    try {
        const sources = linesToArray(el('m3u-sources')?.value);
        const validateMode = el('validate-mode')?.value || 'mixed';
        const maxItems = Number(el('max-items')?.value || 0) || undefined;
        const maxTranscodes = Number(el('max-transcodes')?.value || 0) || undefined;
        const transcode = !!el('enable-transcode')?.checked;
        const allowNoEpisode = !!el('allow-no-episode')?.checked;

        const payload = {
            dryRun: false,
            transcode,
            validateMode,
            maxItems,
            maxTranscodes,
            allowNoEpisode,
            m3u: sources,
            folders: [],
            selectedTitles: selected,
        };

        const result = await api.importAnime(payload, currentAbortController.signal);

        renderStats(result);
        await refreshJobs();

    } catch (e) {
        if (e.name === 'AbortError') {
            showError('Importación detenida por el usuario');
        } else {
            showError(e?.message || 'Error al importar');
        }
    } finally {
        setLoading(analyzeBtn, false);
        setLoading(importBtn, false);
        if (stopBtn) stopBtn.style.display = 'none';
        currentAbortController = null;
    }
}

async function refreshJobs() {
    try {
        const summary = await api.getImportJobsSummary();
        const s = summary.summary || {};
        const text = `queued: ${s.queued || 0} · processing: ${s.processing || 0} · done: ${s.done || 0} · error: ${s.error || 0}`;
        const elSum = el('jobs-summary');
        if (elSum) elSum.textContent = text;

        const jobsRes = await api.getImportJobs({ limit: 50 });
        const jobs = jobsRes.jobs || [];
        const tbody = el('jobs-table');
        if (!tbody) return;

        if (!jobs.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 1.5rem; color: var(--text-secondary);">Sin jobs</td></tr>';
            return;
        }

        tbody.innerHTML = jobs.map((j) => {
            const canRetry = j.status === 'error';
            const err = j.last_error ? String(j.last_error) : '';
            const errShort = err.length > 140 ? `${err.slice(0, 140)}…` : err;
            return `<tr>
                <td>${j.id}</td>
                <td>${j.episode_id}</td>
                <td>${j.status}</td>
                <td>${j.attempts}</td>
                <td>${formatDate(j.updated_at)}</td>
                <td>
                    <button class="btn btn-secondary" data-retry="${j.id}" ${canRetry ? '' : 'disabled'}>Reintentar</button>
                    ${canRetry && errShort ? `<div style="margin-top:8px; color: var(--text-secondary); font-size: 0.85rem; max-width: 360px;">${errShort}</div>` : ''}
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('button[data-retry]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = Number(btn.getAttribute('data-retry'));
                if (!id) return;
                try {
                    await api.retryImportJob(id);
                    await refreshJobs();
                } catch (e) {
                    showError(e?.message || 'Error reintentando job');
                }
            });
        });
    } catch (e) {
        showError(e?.message || 'Error cargando jobs');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const m3uEl = el('m3u-sources');
    if (m3uEl && !m3uEl.value) {
        m3uEl.value = 'c:\\\\Users\\\\ASUS\\\\Documents\\\\Projects\\\\pixel\\\\server\\\\videos\\\\animes_madre.m3u';
    }

    // Analizar
    el('analyze-btn')?.addEventListener('click', runAnalysis);

    // Importar solo seleccionados
    el('import-btn')?.addEventListener('click', async () => {
        await runImport();
    });

    // Stop process
    el('stop-btn')?.addEventListener('click', () => {
        if (currentAbortController) {
            currentAbortController.abort();
        }
    });

    // Upload M3U file
    el('upload-m3u-btn')?.addEventListener('click', async () => {
        clearError();
        const input = el('m3u-file');
        const status = el('upload-m3u-status');
        if (!input || !input.files || !input.files[0]) {
            showError('Selecciona un archivo .m3u primero');
            return;
        }
        try {
            if (status) status.textContent = 'Subiendo...';
            const r = await api.uploadM3uFile(input.files[0]);
            const ta = el('m3u-sources');
            const current = linesToArray(ta?.value);
            current.push(r.localPath || r.url);
            if (ta) ta.value = current.join('\n') + '\n';
            if (status) status.textContent = '✓ Listo';
            input.value = '';
        } catch (e) {
            if (status) status.textContent = '';
            showError(e?.message || 'Error subiendo M3U');
        }
    });

    // Select all / Deselect all
    el('select-all-btn')?.addEventListener('click', () => {
        document.querySelectorAll('#anime-check-list input[type="checkbox"]').forEach(cb => {
            const item = cb.closest('.anime-check-item');
            if (item && item.style.display !== 'none') cb.checked = true;
        });
        updateSelectedCount();
    });

    el('deselect-all-btn')?.addEventListener('click', () => {
        document.querySelectorAll('#anime-check-list input[type="checkbox"]').forEach(cb => {
            const item = cb.closest('.anime-check-item');
            if (item && item.style.display !== 'none') cb.checked = false;
        });
        updateSelectedCount();
    });

    // Search filter
    el('anime-search')?.addEventListener('input', (e) => {
        filterAnimeList(e.target.value);
    });

    // Delegate checkbox changes
    el('anime-check-list')?.addEventListener('change', updateSelectedCount);

    // Jobs
    el('refresh-jobs')?.addEventListener('click', refreshJobs);
    await refreshJobs();
    setInterval(refreshJobs, 5000);
});
