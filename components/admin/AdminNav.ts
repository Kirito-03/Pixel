export type AdminNavItem = {
  key: string
  label: string
  shortLabel?: string
  icon: string
  route: string
  params?: Record<string, any>
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { key: 'dashboard', label: 'Dashboard', shortLabel: 'Inicio', icon: 'grid-outline', route: 'AdminDashboard' },
  { key: 'import', label: 'Importar', shortLabel: 'Importar', icon: 'cloud-download-outline', route: 'AdminImport' },
  { key: 'anime', label: 'Catálogo', shortLabel: 'Anime', icon: 'film-outline', route: 'AnimeList' },
  { key: 'bot', label: 'Smart Bot', shortLabel: 'Bot', icon: 'hardware-chip-outline', route: 'AdminBot' },
  { key: 'create', label: 'Nuevo anime', shortLabel: 'Nuevo', icon: 'add-circle-outline', route: 'AnimeForm', params: { mode: 'create' } },
]
