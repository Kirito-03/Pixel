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

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardStats();
});
