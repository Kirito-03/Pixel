import React, { createContext, useContext, useMemo, useState } from 'react';

const ReaderChromeContext = createContext({ reading: false, bottomVisible: true,
  setReading: (_value: boolean) => {}, setBottomVisible: (_value: boolean) => {} });
export function ReaderChromeProvider({ children }: { children: React.ReactNode }) {
  const [reading, setReading] = useState(false);
  const [bottomVisible, setBottomVisible] = useState(true);
  const value = useMemo(() => ({ reading, bottomVisible, setReading, setBottomVisible }), [reading, bottomVisible]);
  return <ReaderChromeContext.Provider value={value}>{children}</ReaderChromeContext.Provider>;
}
export const useReaderChrome = () => useContext(ReaderChromeContext);
