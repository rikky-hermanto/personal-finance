import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'pf:focus-mode';

interface FocusModeContextValue {
  focused: boolean;
  toggle: () => void;
}

const FocusModeContext = createContext<FocusModeContextValue>({
  focused: false,
  toggle: () => {},
});

export const FocusModeProvider = ({ children }: { children: React.ReactNode }) => {
  const [focused, setFocused] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setFocused((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(focused));
    } catch {}
  }, [focused]);

  return (
    <FocusModeContext.Provider value={{ focused, toggle }}>
      {children}
    </FocusModeContext.Provider>
  );
};

export const useFocusMode = () => useContext(FocusModeContext);
