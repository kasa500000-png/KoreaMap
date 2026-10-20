import type { ReactNode } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

export const metadata = {
  title: 'Korea Map Kit · 로컬 데모',
  description: '외부 API 없는 합성 지도 예제',
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
