import React, { useState, useRef } from 'react';
import { Alert, Modal, Platform } from 'react-native';
import AnimeSeriesModal from './AnimeSeriesModal';
import EpisodePlayer from './EpisodePlayer';
import { ContentItem, AnimeEpisode, AnimeSeason } from '../types';
import { useProfile } from '../contexts/ProfileContext';
import { canReachUrl } from '../services/connectivity';
import { episodePlaybackSources } from '../services/episodePlaybackSources';
import { offlineDownloads } from '../services/offlineDownloads';
import { catalogService } from '../services/catalogService';

interface AnimeSeriesModalWrapperProps {
  content: ContentItem | null;
  visible: boolean;
  onClose: () => void;
  startFromEpisodeId?: number | null;
  startFromTimeSeconds?: number | null;
}

export default function AnimeSeriesModalWrapper({
  content,
  visible,
  onClose,
  startFromEpisodeId = null,
  startFromTimeSeconds = null,
}: AnimeSeriesModalWrapperProps) {
  const { currentProfile } = useProfile();
  const [showEpisodePlayer, setShowEpisodePlayer] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<AnimeEpisode | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<AnimeSeason | null>(null);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);
  const consumedStart = useRef<string | null>(null);
  const openSession = useRef(0);
  const [resumeTimeSeconds, setResumeTimeSeconds] = useState<number>(0);

  React.useEffect(() => {
    openSession.current++;
    setShowEpisodePlayer(false);
    setSelectedEpisode(null);
    setSelectedSeason(null);
    consumedStart.current = null;
  }, [visible, content?.id]);

  React.useEffect(() => {
    if (!visible) return;
    if (!content || content.type !== 'anime') return;
    if (!startFromEpisodeId) return;
    const requestKey = `${content.id}:${startFromEpisodeId}:${startFromTimeSeconds || 0}`;
    if (consumedStart.current === requestKey) return;
    consumedStart.current = requestKey;

    let cancelled = false;
    const run = async () => {
      try {
        const episodes = await catalogService.getAnimeEpisodes(Number(content.id));
        const target = episodes.find((ep) => Number(ep.id) === Number(startFromEpisodeId));
        if (!target) return;

        const grouped = new Map<number, AnimeEpisode[]>();
        for (const ep of episodes) {
          const season = typeof ep.season === 'number' ? ep.season : 1;
          const url = ep.stream_url || ep.video_url || undefined;
          const episodeItem: AnimeEpisode = {
            id: String(ep.id),
            number: ep.episode_number,
            title: ep.title || `Episodio ${ep.episode_number}`,
            url,
            downloadUrl: ep.video_url || undefined,
            external_servers: ep.external_servers || undefined,
          };
          const list = grouped.get(season) || [];
          list.push(episodeItem);
          grouped.set(season, list);
        }

        const seasons: AnimeSeason[] = Array.from(grouped.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([season, eps]) => ({
            id: `season-${season}`,
            season,
            title: season === 1 ? 'Temporada 1' : `Temporada ${season}`,
            episodes: eps.sort((a, b) => a.number - b.number),
          }));

        const s = seasons.find((x) => x.season === (target.season || 1));
        const e = s?.episodes.find((x) => Number(x.id) === Number(startFromEpisodeId));
        const idx = s ? s.episodes.findIndex((x) => Number(x.id) === Number(startFromEpisodeId)) : -1;
        if (cancelled || !s || !e || idx < 0) return;
        setResumeTimeSeconds(Number(startFromTimeSeconds || 0));
        setSelectedSeason(s);
        setSelectedEpisode(e);
        setCurrentEpisodeIndex(idx);
        setShowEpisodePlayer(true);
      } catch {
        if (!cancelled) Alert.alert('No se pudo abrir el episodio', 'Puedes elegirlo desde los detalles e intentarlo otra vez.');
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [visible, content?.id, content?.type, startFromEpisodeId, startFromTimeSeconds]);

  const handlePlayEpisode = async (episode: AnimeEpisode, season: AnimeSeason, resumeSeconds?: number) => {
    // NO cerrar el modal de detalles, solo abrir el reproductor
    const session = openSession.current;
    let ep = episode;
    const profileId = currentProfile?.id;
    const animeId = content?.id ? Number(content.id) : 0;
    const episodeId = Number(episode.id);

    if (Platform.OS === 'android' && profileId && animeId && Number.isFinite(episodeId) && episodeId > 0) {
      const online = await canReachUrl(episodePlaybackSources(episode)[0]?.url || '');
      if (!online) {
        const localUri = await offlineDownloads.getEpisodeUri(profileId, episodeId);
        if (!localUri) {
          Alert.alert('Sin conexión', 'Este episodio no está descargado.');
          return;
        }
        ep = { ...episode, url: localUri };
      }
    }

    if (session !== openSession.current || !visible) return;
    setSelectedEpisode(ep);
    setSelectedSeason(season);
    setCurrentEpisodeIndex(season.episodes.findIndex(e => e.id === episode.id));
    setResumeTimeSeconds(Number(resumeSeconds || 0));
    setShowEpisodePlayer(true);
  };

  const handleCloseEpisodePlayer = () => {
    setShowEpisodePlayer(false);
    setSelectedEpisode(null);
    setSelectedSeason(null);
    setCurrentEpisodeIndex(0);
  };

  const handleNextEpisode = () => {
    if (!selectedSeason || currentEpisodeIndex >= selectedSeason.episodes.length - 1) return;
    
    const nextIndex = currentEpisodeIndex + 1;
    const nextEpisode = selectedSeason.episodes[nextIndex];
    setCurrentEpisodeIndex(nextIndex);
    setSelectedEpisode(nextEpisode);
    setResumeTimeSeconds(0);
  };

  const handlePreviousEpisode = () => {
    if (!selectedSeason || currentEpisodeIndex <= 0) return;
    
    const prevIndex = currentEpisodeIndex - 1;
    const prevEpisode = selectedSeason.episodes[prevIndex];
    setCurrentEpisodeIndex(prevIndex);
    setSelectedEpisode(prevEpisode);
    setResumeTimeSeconds(0);
  };

  const getTitle = () => {
    return content?.title || 'Sin título';
  };

  const player = visible && showEpisodePlayer && selectedEpisode && selectedSeason ? (
    <EpisodePlayer episode={selectedEpisode} animeTitle={getTitle()}
      animeId={content?.id ? Number(content.id) : 0} seasonNumber={selectedSeason.season}
      profileId={currentProfile?.id} resumeTimeSeconds={resumeTimeSeconds}
      onClose={handleCloseEpisodePlayer} onNextEpisode={handleNextEpisode} onPreviousEpisode={handlePreviousEpisode}
      hasNextEpisode={currentEpisodeIndex < selectedSeason.episodes.length - 1} hasPreviousEpisode={currentEpisodeIndex > 0} />
  ) : null;
  const sharedWindow = Platform.OS === 'android';
  return (
    <>
      <AnimeSeriesModal content={content} visible={visible && (sharedWindow || !showEpisodePlayer)}
        onClose={onClose} onPlayEpisode={handlePlayEpisode}
        playback={sharedWindow ? player : null} onClosePlayback={handleCloseEpisodePlayer} />
      {!sharedWindow && player && <Modal visible animationType="slide" transparent={false}
        statusBarTranslucent navigationBarTranslucent onRequestClose={handleCloseEpisodePlayer}>
        {player}
      </Modal>}
    </>
  );
}
