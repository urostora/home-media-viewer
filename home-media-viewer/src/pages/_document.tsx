import { Html, Head, Main, NextScript } from 'next/document'

const Document = (): JSX.Element => {
  return (
    <Html lang="en">
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
};

export default  Document;