import { useCallback, useEffect, useRef, useState } from 'react';
import { completeOAuth, connectWithApiKey, startOAuth } from '../lib/provider-actions';
import type { AuthMethod, ProviderInfo } from './use-provider-list';

export interface ConnectFlowState {
  step: 'select' | 'api-key' | 'oauth-waiting' | 'oauth-code';
  selectedMethod: number;
  apiKey: string;
  setApiKey(v: string): void;
  oauthCode: string;
  setOauthCode(v: string): void;
  instructions: string;
  loading: boolean;
  error: string;
  selectMethod(i: number): void;
  continue(): void;
  submitApiKey(): Promise<void>;
  submitOAuthCode(): Promise<void>;
  reset(): void;
}

export function useConnectFlow(
  provider: ProviderInfo,
  authMethods: AuthMethod[],
  onConnected: () => void,
): ConnectFlowState {
  const initialStep =
    authMethods.length <= 1 && authMethods[0]?.type !== 'oauth' ? 'api-key' : 'select';
  const [step, setStep] = useState<'select' | 'api-key' | 'oauth-waiting' | 'oauth-code'>(
    initialStep,
  );
  const [selectedMethod, setSelectedMethod] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [oauthCode, setOauthCode] = useState('');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canceledRef = useRef(false);
  const verifierRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    return () => {
      canceledRef.current = true;
    };
  }, []);

  const reset = useCallback(() => {
    canceledRef.current = true;
    setStep(initialStep);
    setSelectedMethod(0);
    setApiKey('');
    setOauthCode('');
    setInstructions('');
    setLoading(false);
    setError('');
  }, [initialStep]);

  const submitApiKey = useCallback(async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    setError('');
    try {
      await connectWithApiKey(provider.id, apiKey);
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set API key');
    } finally {
      setLoading(false);
    }
  }, [apiKey, provider.id, onConnected]);

  const continueFlow = useCallback(() => {
    const method = authMethods[selectedMethod];
    if (!method) return;
    if (method.type === 'api') {
      setStep('api-key');
      return;
    }
    // OAuth flow
    setLoading(true);
    setError('');
    canceledRef.current = false;
    startOAuth(provider.id, method.id)
      .then((result) => {
        verifierRef.current = result.verifier;
        if (result.method === 'auto') {
          setStep('oauth-waiting');
          completeOAuth(provider.id, undefined, result.verifier, method.id)
            .then(() => {
              if (!canceledRef.current) onConnected();
            })
            .catch((err) => {
              if (!canceledRef.current) {
                setError(err instanceof Error ? err.message : 'OAuth failed');
                setStep('select');
              }
            });
        } else {
          setStep('oauth-code');
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to start OAuth');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [authMethods, provider.id, selectedMethod, onConnected]);

  const submitOAuthCode = useCallback(async () => {
    if (!oauthCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      const method = authMethods[selectedMethod];
      await completeOAuth(provider.id, oauthCode, verifierRef.current, method?.id);
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete OAuth');
    } finally {
      setLoading(false);
    }
  }, [oauthCode, provider.id, selectedMethod, authMethods, onConnected]);

  return {
    step,
    selectedMethod,
    apiKey,
    setApiKey,
    oauthCode,
    setOauthCode,
    instructions,
    loading,
    error,
    selectMethod: setSelectedMethod,
    continue: continueFlow,
    submitApiKey,
    submitOAuthCode,
    reset,
  };
}
