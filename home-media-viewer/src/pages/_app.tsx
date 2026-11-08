import type { JSX, ReactElement, ReactNode } from 'react';
import type { NextPage } from 'next';
import type { AppProps } from 'next/app';

import '@/styles/globals.css';
import Layout from '@/components/layout/layout';
import { ThemeProvider } from '@/components/layout/themeProvider';

export type NextPageWithLayout<P = object, IP = P> = NextPage<P, IP> & {
    getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
    Component: NextPageWithLayout;
};

const App = ({ Component, pageProps }: AppPropsWithLayout): JSX.Element => (
    <ThemeProvider>
        <Layout>
            <Component {...pageProps} />
        </Layout>
    </ThemeProvider>
);

export default App;
