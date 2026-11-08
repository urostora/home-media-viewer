import type { JSX } from 'react';
import { Html, Head, Main, NextScript } from 'next/document';
import { themeBootstrap } from '@/utils/frontend/theme';

const Document = (): JSX.Element => {
    return (
        <Html lang="en">
            <Head>
                <meta name="robots" content="noindex" />
                <meta name="color-scheme" content="light dark" />
                <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
            </Head>
            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
};

export default Document;
