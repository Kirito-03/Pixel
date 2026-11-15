// Dashboard functionality

async function loadDashboardStats() {
    try {
        const stats = await api.getStats();

        // Update stat cards
        document.getElementById('total-anime').textContent = stats.totalAnime || 0;
        document.getElementById('total-episodes').textContent = stats.totalEpisodes || 0;

        // Update storage stats
        const gdriveStats = stats.storageStats?.find(s => s.storage_type === 'gdrive');
        const localStats = stats.storageStats?.find(s => s.storage_type === 'local');

        document.getElementById('gdrive-count').textContent = gdriveStats?.count || 0;
        document.getElementById('local-count').textContent = localStats?.count || 0;

        // Load recent anime
        loadRecentAnime(stats.recentAnime || []);

        // Load Google Drive Inventory
        loadDriveInventory();
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        showError('Error al cargar estadísticas');
    }
}

function loadRecentAnime(animeList) {
    const tbody = document.getElementById('recent-anime-table');

    if (animeList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 2rem; color: #666;">
                    No hay anime agregado aún. <a href="./anime-form.html">Agregar el primero</a>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = animeList.map(anime => `
        <tr>
            <td>
                <strong>${escapeHtml(anime.title)}</strong>
                ${anime.title_english ? `<br><small style="color: #666;">${escapeHtml(anime.title_english)}</small>` : ''}
            </td>
            <td>
                <span class="badge ${getStatusBadgeClass(anime.status)}">
                    ${anime.status || 'Unknown'}
                </span>
            </td>
            <td>${anime.total_episodes || 0}</td>
            <td>${formatDate(anime.created_at)}</td>
            <td>
                <a href="./episode-manager.html?id=${anime.id}" class="btn btn-secondary" style="padding: 0.375rem 0.75rem; font-size: 0.8125rem;">
                    Gestionar
                </a>
            </td>
        </tr>
    `).join('');
}

function getStatusBadgeClass(status) {
    const statusMap = {
        'Airing': 'badge-success',
        'Finished': 'badge-warning',
        'Upcoming': 'badge-error'
    };
    return statusMap[status] || 'badge-warning';
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    alert(message); // TODO: Replace with better notification system
}

async function loadDriveInventory() {
    const tbody = document.getElementById('drive-inventory-table');
    if (!tbody) return;

    try {
        const inv = await api.getDriveInventory();
        const items = [];

        // Anime items
        (inv.anime || []).forEach(a => {
            const sizeMb = a.file_size ? `${(a.file_size / (1024 * 1024)).toFixed(1)} MB` : 'En Drive';
            items.push({
                type: 'Anime',
                title: a.title,
                epInfo: `Episodio ${a.episode_number}`,
                size: sizeMb,
                url: a.stream_url,
            });
        });

        // Manga items
        (inv.manga || []).forEach(m => {
            const match = (m.chapter_url || '').match(/manga\/([^/]+)\/([^/]+)/);
            const title = match ? match[1].replace(/-/g, ' ') : 'Manga';
            const cap = match ? match[2].replace(/-/g, ' ') : 'Capítulo';
            items.push({
                type: 'Manga',
                title: title,
                epInfo: `${cap} (${m.page_count || 0} págs)`,
                size: 'Imágenes',
                url: m.chapter_url,
            });
        });

        // Hentai items
        (inv.hentai || []).forEach(h => {
            items.push({
                type: 'Hentai',
                title: h.title,
                epInfo: `Episodio ${h.episode_number}`,
                size: 'VIP 720p',
                url: h.stream_url,
            });
        });

        if (items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 2rem; color: #888;">
                        No hay archivos sincronizados en Google Drive aún.
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = items.map(item => `
                <tr>
                    <td>
                        <span style="display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; ${
                            item.type === 'Anime' ? 'background: #1976d2; color: #fff;' :
                            item.type === 'Manga' ? 'background: #7b1fa2; color: #fff;' :
                            'background: #c2185b; color: #fff;'
                        }">
                            ${item.type}
                        </span>
                    </td>
                    <td><strong>${escapeHtml(item.title)}</strong></td>
                    <td>${escapeHtml(item.epInfo)}</td>
                    <td><small style="color: #aaa;">${item.size}</small></td>
                    <td>
                        ${item.url ? `
                            <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; text-decoration: none;">
                                Ver Stream
                            </a>
                        ` : '—'}
                    </td>
                </tr>
            `).join('');
        }

        renderDriveSyncStatus(inv.activeJobs || []);
        renderDrivePending(inv.pending || {});
    } catch (e) {
        console.error('Error cargando inventario de Drive:', e);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 1.5rem; color: #e57373;">
                    Error al cargar el inventario de Drive.
                </td>
            </tr>
        `;
    }
}

function showDriveStatus(message, isError = false) {
    const el = document.getElementById('drive-sync-status');
    if (!el) return;
    if (!message) {
        el.style.display = 'none';
        return;
    }
    el.style.display = 'block';
    el.style.background = isError ? 'rgba(198, 40, 40, 0.16)' : 'rgba(46, 125, 50, 0.16)';
    el.style.borderColor = isError ? '#e53935' : '#2e7d32';
    el.style.color = isError ? '#ffcdd2' : '#c8e6c9';
    el.textContent = message;
}

function renderDriveSyncStatus(activeJobs) {
    const running = (activeJobs || []).find(j => j.status === 'running');
    if (running) {
        showDriveStatus(`Subiendo en segundo plano: ${running.label}`);
    }
}

function renderDrivePending(pending) {
    const tbody = document.getElementById('drive-pending-table');
    if (!tbody) return;

    const rows = [];
    (pending.anime || []).forEach(a => {
        rows.push({
            badgeBg: '#1976d2',
            typeLabel: 'Anime',
            title: a.title,
            state: `${a.synced_episodes}/${a.total_episodes} en Drive (Faltan ${a.missing_episodes})`,
            buttons: [
                ...(a.next_episode_id ? [{
                    label: `+ Ep ${a.next_episode_number}`,
                    type: 'episode',
                    id: String(a.next_episode_id),
                    bg: '#1976d2'
                }] : []),
                {
                    label: 'Subir 5',
                    type: 'anime',
                    id: String(a.anime_id),
                    limit: '5',
                    bg: '#2e7d32'
                }
            ]
        });
    });

    (pending.manga || []).forEach(m => {
        rows.push({
            badgeBg: '#7b1fa2',
            typeLabel: 'Manga',
            title: m.title,
            state: `${m.synced_chapters}/${m.total_chapters} caps en Drive (Faltan ${m.missing_chapters})`,
            buttons: [{
                label: 'Subir 5 caps',
                type: 'manga',
                id: String(m.manga_id),
                limit: '5',
                bg: '#7b1fa2'
            }]
        });
    });

    (pending.hentai || []).forEach(h => {
        rows.push({
            badgeBg: '#c2185b',
            typeLabel: 'Hentai',
            title: h.title,
            state: `${h.synced_episodes}/${h.total_episodes} eps en Drive (Faltan ${h.missing_episodes})`,
            buttons: [{
                label: 'Subir a Drive',
                type: 'hentai',
                id: String(h.hentai_id),
                bg: '#c2185b'
            }]
        });
    });

    if (rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 1.5rem; color: #888;">
                    No hay contenido pendiente con fuente compatible para Drive.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map(r => `
        <tr>
            <td>
                <span style="display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; background: ${r.badgeBg}; color: #fff;">
                    ${r.typeLabel}
                </span>
            </td>
            <td><strong>${escapeHtml(r.title)}</strong></td>
            <td><small style="color: #fbbf24;">${escapeHtml(r.state)}</small></td>
            <td>
                <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                    ${r.buttons.map(btn => `
                        <button
                            type="button"
                            class="btn btn-secondary js-drive-sync-btn"
                            data-sync-type="${escapeHtml(btn.type)}"
                            data-sync-id="${escapeHtml(btn.id)}"
                            ${btn.limit ? `data-sync-limit="${escapeHtml(btn.limit)}"` : ''}
                            style="padding: 0.25rem 0.6rem; font-size: 0.75rem; background: ${btn.bg}; border-color: ${btn.bg}; color: #fff; cursor: pointer;"
                        >
                            ${escapeHtml(btn.label)}
                        </button>
                    `).join('')}
                </div>
            </td>
        </tr>
    `).join('');
}

async function triggerDriveSync(payload, triggerBtn) {
    if (triggerBtn) triggerBtn.disabled = true;
    try {
        const res = await api.syncDrive(payload);
        showDriveStatus(res?.message || 'Sincronización con Google Drive iniciada en segundo plano.', false);
        await loadDriveInventory();
    } catch (err) {
        showDriveStatus(err?.message || 'No se pudo iniciar la sincronización con Drive.', true);
    } finally {
        if (triggerBtn) triggerBtn.disabled = false;
    }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardStats();

    const batchBtn = document.getElementById('btn-drive-batch');
    if (batchBtn) {
        batchBtn.addEventListener('click', () => triggerDriveSync({ type: 'batch' }, batchBtn));
    }

    const pendingTable = document.getElementById('drive-pending-table');
    if (pendingTable) {
        pendingTable.addEventListener('click', (event) => {
            const btn = event.target.closest('.js-drive-sync-btn');
            if (!btn) return;
            const type = btn.getAttribute('data-sync-type');
            const id = btn.getAttribute('data-sync-id');
            const limit = btn.getAttribute('data-sync-limit');
            triggerDriveSync({
                type,
                id,
                ...(limit ? { limit: Number(limit) } : {})
            }, btn);
        });
    }
});
