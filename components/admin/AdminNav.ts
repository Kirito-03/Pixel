export type AdminNavItem = {
  key: string
  label: string
  icon: string
  route?: string
  disabled?: boolean
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid-outline', route: 'AdminDashboard' },
  { key: 'import', label: 'Importar', icon: 'cloud-download-outline', route: 'AdminImport' },
  { key: 'anime', label: 'Anime', icon: 'film-outline', route: 'AnimeList' },
  { key: 'episodes', label: 'Episodios', icon: 'albums-outline', disabled: true },
  { key: 'bot', label: 'Smart Bot', icon: 'hardware-chip-outline', route: 'AdminBot' },
  { key: 'create', label: 'Nuevo anime', icon: 'add-circle-outline', disabled: true },
]
