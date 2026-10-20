'use client';
import dynamic from 'next/dynamic';
export const MapClient = dynamic(() => import('./map-demo').then((module) => module.MapDemo), {
  ssr: false,
  loading: () => <p role="status">지도 모듈 준비 중</p>,
});
