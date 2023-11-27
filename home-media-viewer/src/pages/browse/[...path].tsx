import { useRouter } from 'next/router'

import Browser from '@/components/browser';

const BrowsePage = () => {
    const router = useRouter();

    const requestedPath: string | undefined = (Array.isArray(router?.query?.path)
        ? router.query.path.join('/')
        : router.query.path) ?? '';

    if (typeof requestedPath !== 'string') {
        return <>{`Path id (${requestedPath}) invalid`}</>;
    }

    return <Browser path={requestedPath} />;
};

export default BrowsePage;