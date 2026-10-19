'use client';
import dynamic from 'next/dynamic';
export const SearchClient = dynamic(
  () => import('./search-demo').then((module) => module.SearchDemo),
  {
    ssr: false,
    loading: () => <p role="status">검색 지도 준비 중</p>,
  },
);
