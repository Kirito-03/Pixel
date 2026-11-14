export type MangaStatus = 'En emisión' | 'Finalizado';

export interface MangaItem {
  id: string;
  title: string;
  image: string;
  status: MangaStatus;
  rating: number;
  chapters: number;
  updatedAt: string; // ISO
  popular?: boolean;
}

export const MOCK_MANGA: MangaItem[] = [
  {
    id: '1',
    title: 'Jujutsu Kaisen',
    image: 'https://i.pinimg.com/originals/94/af/42/94af42c6b4a388e8da2b8d63d1a26b76.jpg',
    status: 'En emisión',
    rating: 9.2,
    chapters: 250,
    updatedAt: '2026-04-14T00:00:00Z',
    popular: true,
  },
  {
    id: '2',
    title: 'Chainsaw Man',
    image: 'https://i.pinimg.com/originals/8d/f0/be/8df0be76d5e3c60c52af7a8dc1c6f5e9.jpg',
    status: 'En emisión',
    rating: 9.5,
    chapters: 180,
    updatedAt: '2026-04-13T00:00:00Z',
    popular: true,
  },
  {
    id: '3',
    title: 'My Hero Academia',
    image: 'https://i.pinimg.com/originals/b8/32/f8/b832f8b671047a44e72d2c3fa3bb5e5a.jpg',
    status: 'Finalizado',
    rating: 8.8,
    chapters: 400,
    updatedAt: '2026-04-10T00:00:00Z',
    popular: true,
  },
  {
    id: '4',
    title: 'One Punch Man',
    image: 'https://images.unsplash.com/photo-1613376023733-0a73315d9b06?w=800',
    status: 'En emisión',
    rating: 9.0,
    chapters: 220,
    updatedAt: '2026-04-11T00:00:00Z',
  },
  {
    id: '5',
    title: 'Demon Slayer',
    image: 'https://i.pinimg.com/originals/4c/5c/1e/4c5c1e48a4f12f4d4e8c0dc7a3c8f1a1.jpg',
    status: 'Finalizado',
    rating: 9.3,
    chapters: 205,
    updatedAt: '2026-04-09T00:00:00Z',
  },
  {
    id: '6',
    title: 'Tokyo Revengers',
    image: 'https://i.pinimg.com/originals/b8/32/f8/b832f8b671047a44e72d2c3fa3bb5e5a.jpg',
    status: 'Finalizado',
    rating: 8.6,
    chapters: 278,
    updatedAt: '2026-04-07T00:00:00Z',
  },
];

export const MOCK_MANGA_POPULAR = MOCK_MANGA
  .filter(m => m.popular)
  .slice(0, 3)
  .map((m, i) => ({ ...m, rank: i + 1 }));
