'use client';

import dynamic from 'next/dynamic';

export const TilesClient = dynamic(
  () => import('./tiles-demo').then((module) => module.TilesDemo),
  {
    ssr: false,
    loading: () => <p role="status">지도 연결 화면 준비 중</p>,
  },
);
