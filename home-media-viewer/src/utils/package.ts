import { version } from './../../package.json';

export const getVersionString = (): string => version ?? '0.0.0';
