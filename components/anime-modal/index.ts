/**
 * Barrel export para el módulo anime-modal.
 * 
 * El hook useAnimeModal contiene toda la lógica de negocio extraída del
 * componente AnimeSeriesModal (~813 líneas). Los nuevos consumidores
 * deberían importar desde aquí.
 * 
 * El componente AnimeSeriesModal.tsx original sigue funcionando como antes
 * y se migrará incrementalmente para usar este hook.
 */
export { useAnimeModal } from './useAnimeModal';
export type {
  AnimeSeriesModalProps,
  UseAnimeModalReturn,
  AnimeHeroSectionProps,
  AnimeContinueCardProps,
  AnimeInfoSectionProps,
  AnimeEpisodesSectionProps,
  AnimeEpisodeCardProps,
  AnimeSimilarSectionProps,
} from './types';
