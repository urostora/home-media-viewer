import type { ReactElement, ReactNode } from 'react'
import { useState } from 'react'
import type { NextPage } from 'next'
import type { AppProps } from 'next/app'

import styles from '@/styles/Home.module.css'
import '@/styles/globals.css'
import Layout from '@/components/layout/layout'
import { AuthContext, AuthData } from '@/components/auth/authContext'
import Head from 'next/head'
import LayoutLoggedIn from '@/components/layout/layoutLoggedIn'
import LayoutNotLoggedIn from '@/components/layout/layoutNotLoggedIn'

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode
}
 
type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout
}

const App = ({ Component, pageProps }: AppPropsWithLayout) =>  (<Layout><Component {...pageProps} /></Layout>);

export default App;

