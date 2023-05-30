import { createContext } from 'react';

export interface AuthData {
  isLoggedIn: boolean;
  name?: string;
  email?: string;
  isAdmin?: boolean;
  sessionExpiresOn?: Date;
}

export const AuthContext = createContext<AuthData>({ isLoggedIn: false });
