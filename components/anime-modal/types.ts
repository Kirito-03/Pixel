import { Animated } from 'react-native';
import { ContentItem, MovieDetail, TVShowDetail, AnimeDetail, StreamingInfo, AnimeEpisode, AnimeSeason } from '../../types';

// Re-export for convenience
export type { ContentItem, MovieDetail, TVShowDetail, AnimeDetail, StreamingInfo, AnimeEpisode, AnimeSeason };

/** Props of the top-level AnimeSeriesModal (public API – DO NOT change) */
export interface AnimeSeriesModalProps {
  content: ContentItem | null;
  visible: boolean;
  onClose: () => void;
  onPlayEpisode?: (episode: AnimeEpisode, season: AnimeSeason, resumeTimeSeconds?: number) => void;
}

/** Everything returned by the useAnimeModal hook */
export interface UseAnimeModalReturn {
  // State
  currentContent: ContentItem | null;
  detailData: MovieDetail | TVShowDetail | AnimeDetail | null;
  trailerKey: string | null;
  loading: boolean;
  relatedContent: ContentItem[];
  loadingRelated: boolean;
  trailerDelay: boolean;
  trailerFinished: boolean;
  streamingInfo: StreamingInfo | null;
  loadingStreaming: boolean;
  selectedSeason: AnimeSeason | null;
  showSeasonPicker: boolean;
  isTogglingMyList: boolean;
  isTogglingDownloads: boolean;
  currentInDownloads: boolean;
  currentInMyList: boolean;
  refreshing: boolean;

  // Animated values
  fadeAnim: Animated.Value;
  contentFadeAnim: Animated.Value;
  descSlideAnim: Animated.Value;

  // Screen helpers
  isSmallScreen: boolean;
  width: number;
  height: number;

  // Setters exposed to children
  setCurrentContent: (c: ContentItem | null) => void;
  setTrailerDelay: (v: boolean) => void;
  setTrailerFinished: (v: boolean) => void;
  setShowSeasonPicker: (v: boolean) => void;
  setSelectedSeason: (s: AnimeSeason | null) => void;

  // Handlers
  handleClose: () => void;
  handleRefresh: () => Promise<void>;
  handlePlayEpisode: (episode: AnimeEpisode, season: AnimeSeason, resumeTimeSeconds?: number) => void;
  handleWatchNow: () => Promise<void>;
  handlePlayTrailer: () => void;
  handleCloseTrailer: () => void;
  handleToggleList: () => Promise<void>;
  handleDownloadOptions: () => Promise<void>;
  handleRemoveFromDownloads: () => Promise<void>;
  openExternalTrailer: (key?: string | null) => void;
  loadContentDetails: () => Promise<void>;
  loadRelatedContent: () => Promise<void>;

  // Helpers
  getTitle: () => string;
  getReleaseDate: () => string;
  getRuntime: () => number;
  getAgeRating: () => string;
  isRealAnime: () => boolean;
  isAnimeMovie: () => boolean;
  cleanDescription: (description: string) => string;
  formatRuntime: (minutes: number) => string;
  formatDate: (dateString: string) => string;
}

/** Props for AnimeHeroSection */
export interface AnimeHeroSectionProps {
  hook: UseAnimeModalReturn;
}

/** Props for AnimeContinueCard */
export interface AnimeContinueCardProps {
  hook: UseAnimeModalReturn;
}

/** Props for AnimeInfoSection */
export interface AnimeInfoSectionProps {
  hook: UseAnimeModalReturn;
}

/** Props for AnimeEpisodesSection */
export interface AnimeEpisodesSectionProps {
  hook: UseAnimeModalReturn;
}

/** Props for AnimeEpisodeCard */
export interface AnimeEpisodeCardProps {
  episode: AnimeEpisode;
  onPress: () => void;
  cleanDescription: (desc: string) => string;
}

/** Props for AnimeSimilarSection */
export interface AnimeSimilarSectionProps {
  hook: UseAnimeModalReturn;
}
