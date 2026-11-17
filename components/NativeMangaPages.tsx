import React, { useEffect, useMemo, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { nativeReaderHtml } from '../utils/nativeReaderHtml';

export default function NativeMangaPages({ pages, previous, next, active, onPrevious, onNext, onPage, onAtTop, onScroll, topSpace = 0, bottomSpace = 0 }: {
  pages: string[]; previous?: string | null; next?: string | null; active: boolean;
  onPrevious: () => void; onNext: () => void; onPage: (page: number) => void; onAtTop?: (atTop: boolean) => void; onScroll?: (y: number) => void; topSpace?: number; bottomSpace?: number;
}) {
  const ref = useRef<WebView>(null);
  const html = useMemo(() => nativeReaderHtml(pages, previous, next, topSpace, bottomSpace), [pages, previous, next, topSpace, bottomSpace]);
  const setActive = () => ref.current?.injectJavaScript(`window.pixelReaderActive&&window.pixelReaderActive(${active});true;`);
  useEffect(() => { setActive(); }, [active, html]);
  return <WebView ref={ref} source={{ html, baseUrl: 'https://pixelnosekai.com' }} style={{ flex: 1, backgroundColor: '#080808' }}
    javaScriptEnabled domStorageEnabled={false} mixedContentMode="never" setSupportMultipleWindows={false}
    javaScriptCanOpenWindowsAutomatically={false} onOpenWindow={() => {}} onLoadEnd={setActive}
    onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url === 'https://pixelnosekai.com/'}
    onMessage={event => { try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'previous' && previous != null) onPrevious();
      if (message.type === 'next' && next != null) onNext();
      if (message.type === 'page' && Number.isInteger(message.value) && message.value > 0 && message.value <= pages.length) onPage(message.value);
      if (message.type === 'scroll' && Number.isFinite(message.value)) onScroll?.(message.value);
      if (message.type === 'atTop' && typeof message.value === 'boolean') onAtTop?.(message.value);
    } catch {} }} />;
}
