import { createContext } from 'react';

export interface AuthData {
  isLoggedIn: boolean;
  name?: string;
  email?: string;
  isAdmin?: boolean;
  sessionExpiresOn?: number;
  sessionExpiresInSeconds?: number;
  logout?: () => void;
}

export const AuthContext = createContext<AuthData>({ isLoggedIn: false });
