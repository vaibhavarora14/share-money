import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

interface UpgradeDetails {
  minVersion?: string;
  latestVersion?: string;
  storeUrlIos?: string;
  storeUrlAndroid?: string;
}

interface UpgradeContextValue {
  isUpgradeRequired: boolean;
  upgradeMessage: string | null;
  upgradeDetails: UpgradeDetails | null;
  triggerUpgrade: (message?: string, details?: string) => void;
}

const UpgradeContext = createContext<UpgradeContextValue | null>(null);

// Global callback that can be called from outside React (e.g., api.ts)
let globalUpgradeTrigger: ((message?: string, details?: string) => void) | null = null;

/**
 * Call this from api.ts when a 426 response is received.
 * It will trigger the ForceUpdateModal if the UpgradeProvider is mounted.
 */
export function triggerGlobalUpgrade(message?: string, details?: string): void {
  if (globalUpgradeTrigger) {
    globalUpgradeTrigger(message, details);
  } else {
    console.warn('UpgradeProvider not mounted, cannot show upgrade modal');
  }
}

export function UpgradeProvider({ children }: { children: ReactNode }) {
  const [isUpgradeRequired, setIsUpgradeRequired] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const [upgradeDetails, setUpgradeDetails] = useState<UpgradeDetails | null>(null);

  const triggerUpgrade = useCallback((message?: string, details?: string) => {
    setIsUpgradeRequired(true);
    setUpgradeMessage(message || "Please update your app to continue using ShareMoney.");
    
    if (details) {
      try {
        const parsed = JSON.parse(details);
        setUpgradeDetails(parsed);
      } catch {
        // Invalid JSON, ignore details
      }
    }
  }, []);

  // Register the global trigger when the provider mounts
  useEffect(() => {
    globalUpgradeTrigger = triggerUpgrade;
    return () => {
      globalUpgradeTrigger = null;
    };
  }, [triggerUpgrade]);

  return (
    <UpgradeContext.Provider
      value={{
        isUpgradeRequired,
        upgradeMessage,
        upgradeDetails,
        triggerUpgrade,
      }}
    >
      {children}
    </UpgradeContext.Provider>
  );
}

export function useUpgrade(): UpgradeContextValue {
  const context = useContext(UpgradeContext);
  if (!context) {
    throw new Error('useUpgrade must be used within an UpgradeProvider');
  }
  return context;
}
