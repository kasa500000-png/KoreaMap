'use client';
import dynamic from 'next/dynamic';
export const ThemeClient = dynamic(
  () => import('./theme-gallery').then((module) => module.ThemeGallery),
  { ssr: false, loading: () => <p role="status">테마 준비 중</p> },
);
