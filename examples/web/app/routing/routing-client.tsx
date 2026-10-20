'use client';
import dynamic from 'next/dynamic';
export const RoutingClient = dynamic(() => import('./routing-demo').then((m) => m.RoutingDemo), {
  ssr: false,
  loading: () => <p role="status">지도 준비 중</p>,
});
