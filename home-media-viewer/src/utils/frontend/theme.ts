export const THEME_KEY = 'hmv:theme';
export const THEME_EVENT = 'hmv:theme-change';
export type Theme = 'light' | 'dark';
export const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark';

// Runs in the document head before the browser paints the application.
export const themeBootstrap = `(()=>{let t;try{t=localStorage.getItem('${THEME_KEY}')}catch{}if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t})()`;
