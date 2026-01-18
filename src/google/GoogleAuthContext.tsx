import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import type { GoogleAuthState } from './types';

interface GoogleAuthContextValue {
  authState: GoogleAuthState;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  getValidAccessToken: () => Promise<string | null>;
}

const GoogleAuthContext = createContext<GoogleAuthContextValue | null>(null);

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<GoogleAuthState>({
    accessToken: null,
    expiresAt: null,
    userEmail: null,
    userPicture: null,
  });
  const [isLoading, setIsLoading] = useState(false);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const userInfo = await fetch(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
          }
        ).then((r) => r.json());

        setAuthState({
          accessToken: tokenResponse.access_token,
          expiresAt: Date.now() + tokenResponse.expires_in * 1000,
          userEmail: userInfo.email,
          userPicture: userInfo.picture,
        });
      } catch {
        // Failed to fetch user info, but token is still valid
        setAuthState({
          accessToken: tokenResponse.access_token,
          expiresAt: Date.now() + tokenResponse.expires_in * 1000,
          userEmail: null,
          userPicture: null,
        });
      }
      setIsLoading(false);
    },
    onError: () => setIsLoading(false),
    scope: DRIVE_SCOPE,
    flow: 'implicit',
  });

  const handleLogin = useCallback(() => {
    setIsLoading(true);
    login();
  }, [login]);

  const handleLogout = useCallback(() => {
    googleLogout();
    setAuthState({
      accessToken: null,
      expiresAt: null,
      userEmail: null,
      userPicture: null,
    });
  }, []);

  const getValidAccessToken = useCallback(async (): Promise<string | null> => {
    if (!authState.accessToken) return null;

    // Check if token is expired (with 5 min buffer)
    if (authState.expiresAt && Date.now() > authState.expiresAt - 300000) {
      return null;
    }

    return authState.accessToken;
  }, [authState]);

  return (
    <GoogleAuthContext.Provider
      value={{
        authState,
        isAuthenticated: !!authState.accessToken,
        isLoading,
        login: handleLogin,
        logout: handleLogout,
        getValidAccessToken,
      }}
    >
      {children}
    </GoogleAuthContext.Provider>
  );
}

export function useGoogleAuth() {
  const context = useContext(GoogleAuthContext);
  if (!context) {
    throw new Error('useGoogleAuth must be used within GoogleAuthProvider');
  }
  return context;
}
