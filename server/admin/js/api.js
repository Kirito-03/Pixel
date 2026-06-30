// API Client for Admin Panel

const API_BASE = window.location.origin;

class AdminAPI {
    constructor() {
        this.baseURL = API_BASE;
    }

    // Helper method for fetch with credentials
    async request(endpoint, options = {}) {
        const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
        const config = {
            ...options,
            credentials: 'include',
            headers: {
                ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
                ...options.headers
            }
        };

        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, config);

            // Handle unauthorized
            if (response.status === 401) {
                window.location.href = '/admin?error=unauthorized';
                return null;
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Auth endpoints
    async getMe() {
        return this.request('/auth/admin/me');
    }

    async logout() {
        return this.request('/auth/admin/logout', { method: 'POST' });
    }

    async checkAuth() {
        return this.request('/auth/admin/check');
    }

    // Stats
    async getStats() {
        return this.request('/api/admin/stats');
    }

    // Anime endpoints
    async getAnime(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return this.request(`/api/admin/anime?${queryString}`);
    }

    async getAnimeById(id) {
        return this.request(`/api/admin/anime/${id}`);
    }

    async createAnime(data) {
        return this.request('/api/admin/anime', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async updateAnime(id, data) {
        return this.request(`/api/admin/anime/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async deleteAnime(id) {
        return this.request(`/api/admin/anime/${id}`, {
            method: 'DELETE'
        });
    }

    // Episode endpoints
    async getEpisodes(animeId) {
        return this.request(`/api/admin/episodes/${animeId}`);
    }

    async createEpisode(data) {
        return this.request('/api/admin/episodes', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async updateEpisode(id, data) {
        return this.request(`/api/admin/episodes/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async deleteEpisode(id) {
        return this.request(`/api/admin/episodes/${id}`, {
            method: 'DELETE'
        });
    }

    // TMDB endpoints
    async searchTMDB(query) {
        return this.request(`/api/admin/tmdb/search?q=${encodeURIComponent(query)}`);
    }

    async getTMDBDetails(tmdbId) {
        return this.request(`/api/admin/tmdb/details/${tmdbId}`);
    }

    async importAnime(payload, signal) {
        return this.request('/api/admin/import/anime', {
            method: 'POST',
            body: JSON.stringify(payload),
            signal
        });
    }

    async getImportJobs(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return this.request(`/api/admin/import/jobs?${queryString}`);
    }

    async getImportJobsSummary() {
        return this.request('/api/admin/import/jobs/summary');
    }

    async retryImportJob(id) {
        return this.request(`/api/admin/import/jobs/${id}/retry`, { method: 'POST' });
    }

    async uploadM3uFile(file) {
        const form = new FormData();
        form.append('file', file);
        return this.request('/api/admin/import/m3u/upload', {
            method: 'POST',
            body: form
        });
    }

    async uploadM3uText(content, name) {
        return this.request('/api/admin/import/m3u/text', {
            method: 'POST',
            body: JSON.stringify({ content, name })
        });
    }
}

// Create global API instance
const api = new AdminAPI();

// Auth guard - redirect to login if not authenticated
async function requireAuth() {
    try {
        const authCheck = await api.checkAuth();
        if (!authCheck.authenticated) {
            window.location.href = '/admin';
            return false;
        }
        return true;
    } catch (error) {
        window.location.href = '/admin';
        return false;
    }
}

// Load user info into sidebar
async function loadUserInfo() {
    try {
        const user = await api.getMe();

        const nameEl = document.getElementById('user-name');
        const emailEl = document.getElementById('user-email');
        const avatarEl = document.getElementById('user-avatar');

        if (nameEl) nameEl.textContent = user.name || 'Admin';
        if (emailEl) emailEl.textContent = user.email || '';
        if (avatarEl) avatarEl.src = user.picture || 'https://via.placeholder.com/40';
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

// Handle logout
async function handleLogout() {
    try {
        await api.logout();
        window.location.href = '/admin';
    } catch (error) {
        console.error('Error logging out:', error);
        alert('Error al cerrar sesión');
    }
}

// Initialize auth on all dashboard pages
document.addEventListener('DOMContentLoaded', async () => {
    // Check if this is a dashboard page (not login)
    if (!window.location.pathname.endsWith('index.html') &&
        window.location.pathname.includes('/admin')) {

        const isAuth = await requireAuth();
        if (isAuth) {
            await loadUserInfo();

            // Setup logout button
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', handleLogout);
            }
        }
    }
});
