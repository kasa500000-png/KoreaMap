'use client';
import dynamic from 'next/dynamic';
export const ScenarioClient = dynamic(
  () => import('./scenario-app').then((module) => module.ScenarioApp),
  { ssr: false, loading: () => <p role="status">예제 준비 중</p> },
);
