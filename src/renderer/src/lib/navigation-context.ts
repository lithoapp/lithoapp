import { createContext, useContext } from 'react';
import type { SettingsCategory } from '@/pages/settings-v2';

interface NavigationActions {
  openSettings: (category?: SettingsCategory) => void;
}

export const NavigationContext = createContext<NavigationActions | null>(null);

export function useNavigation(): NavigationActions {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationContext.Provider');
  return ctx;
}
