'use client';
import dynamic from 'next/dynamic';
export const ApiClient = dynamic(() => import('./api-demo').then((module) => module.ApiDemo), {
  ssr: false,
  loading: () => <p role="status">지도 준비 중</p>,
});
