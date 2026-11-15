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
            return;
        }

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

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardStats();
});
