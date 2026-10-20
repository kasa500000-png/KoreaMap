import { MapClient } from './map-client';
export default function Page() {
  return (
    <>
      <nav aria-label="활용 예제">
        <a href="/walk/">반려견 산책 지도</a> · <a href="/trip/">여행 일정 지도</a>
      </nav>
      <MapClient />
    </>
  );
}
