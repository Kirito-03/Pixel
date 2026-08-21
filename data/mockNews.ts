// Mock data — reemplazar con BD cuando esté lista
export type NewsBadge = 'Estreno' | 'Actualización' | 'Evento' | 'Exclusiva';

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  image: string;
  badge: NewsBadge | string;
  date: string; // ISO string
  featured?: boolean;
  url?: string | null;
}

export const MOCK_NEWS: NewsItem[] = [
  {
    id: '1',
    title: 'Nueva temporada de Attack on Titan confirmada',
    description: 'El estudio MAPPA anuncia la fecha de estreno oficial de la temporada final parte 3.',
    image: 'https://i.pinimg.com/originals/b8/32/f8/b832f8b671047a44e72d2c3fa3bb5e5a.jpg',
    badge: 'Estreno',
    date: '2026-04-14T00:00:00Z',
    featured: true,
  },
  {
    id: '2',
    title: 'Demon Slayer agrega nuevos episodios',
    description: 'La cuarta temporada completa ya está disponible en Pixel no Sekai.',
    image: 'https://static.wikia.nocookie.net/kimetsu-no-yaiba/images/a/ab/Muichiro_Design.png',
    badge: 'Actualización',
    date: '2026-04-13T00:00:00Z',
  },
  {
    id: '3',
    title: 'Maratón especial: Mejores Shonen 2026',
    description: 'Este fin de semana disfruta una selección curada de los mejores animes shonen del año.',
    image: 'https://images.unsplash.com/photo-1613376023733-0a73315d9b06?w=800',
    badge: 'Evento',
    date: '2026-04-11T00:00:00Z',
  },
  {
    id: '4',
    title: 'Jujutsu Kaisen: Película exclusiva',
    description: 'La película Jujutsu Kaisen 0 llega a la plataforma en calidad 4K.',
    image: 'https://i.pinimg.com/originals/94/af/42/94af42c6b4a388e8da2b8d63d1a26b76.jpg',
    badge: 'Exclusiva',
    date: '2026-04-09T00:00:00Z',
  },
  {
    id: '5',
    title: 'Chainsaw Man: Temporada 2 confirmada',
    description: 'MAPPA regresa con más acción en 2027.',
    image: 'https://i.pinimg.com/originals/8d/f0/be/8df0be76d5e3c60c52af7a8dc1c6f5e9.jpg',
    badge: 'Estreno',
    date: '2026-04-08T00:00:00Z',
  },
  {
    id: '6',
    title: 'One Piece alcanza 1000 episodios',
    description: 'La serie más larga celebra un hito histórico en Pixel no Sekai.',
    image: 'https://i.pinimg.com/originals/4c/5c/1e/4c5c1e48a4f12f4d4e8c0dc7a3c8f1a1.jpg',
    badge: 'Evento',
    date: '2026-04-07T00:00:00Z',
  },
];

export const MOCK_TRENDING: { id: string; rank: number; title: string; description: string }[] = [
  { id: 't1', rank: 1, title: 'One Piece alcanza 1000 episodios', description: 'La serie más larga celebra un hito histórico' },
  { id: 't2', rank: 2, title: 'Chainsaw Man segunda temporada confirmada', description: 'MAPPA regresa con más acción en 2027' },
  { id: 't3', rank: 3, title: 'Jujutsu Kaisen: récord de streaming', description: 'Bate todos los récords en la plataforma' },
  { id: 't4', rank: 4, title: 'Naruto regresa con una nueva OVA', description: 'Sorpresa para los fans del ninja más icónico' },
];
