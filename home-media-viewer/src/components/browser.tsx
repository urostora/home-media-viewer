import type { JSX } from 'react';
import BrowserContentList from './content/browserContentList';
import PathNavigator from './content/pathNavigator';
import hmvStyle from '@/styles/hmv.module.scss';

interface BrowserProps {
  path?: string;
}

export default function Browser(props: BrowserProps): JSX.Element {
  const path: string = typeof props?.path === 'string' ? props.path : '';

  return (
    <div className={hmvStyle.browserContainer}>
      <h1 className={hmvStyle.pageTitle}>Browse media</h1>
      <p className={hmvStyle.pageDescription}>Explore folders and manage your library.</p>
      <PathNavigator path={path} />
      <BrowserContentList path={path} />
    </div>
  );
}
