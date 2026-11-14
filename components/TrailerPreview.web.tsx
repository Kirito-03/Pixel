import React from 'react';
export default function TrailerPreview({ id }: { id: string }) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return <iframe title="Tráiler del anime" src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&controls=0&fs=0&rel=0&hl=es`} style={{ width: '100%', height: '100%', minHeight: 200, border: 0 }} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />;
}
