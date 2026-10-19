'use client';
import dynamic from 'next/dynamic';
export const GpsClient = dynamic(() => import('./gps-demo').then((module) => module.GpsDemo), {
  ssr: false,
  loading: () => <p role="status">GPS 지도 준비 중</p>,
});
