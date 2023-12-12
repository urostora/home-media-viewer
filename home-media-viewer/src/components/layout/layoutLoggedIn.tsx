import { type ReactNode } from 'react';

import PageBody from './pageBody';
import PageFooter from './pageFooter';
import PageHeader from './pageHeader';

export default function LayoutLoggedIn(props: { children: ReactNode }): JSX.Element {
  return (
    <>
      <PageHeader />
      <PageBody>{props?.children}</PageBody>
      <PageFooter />
    </>
  );
}