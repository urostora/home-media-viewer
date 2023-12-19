import packageJson from './../../package.json';

export const getVersionString = (): string => packageJson.version ?? '0.0.0';
