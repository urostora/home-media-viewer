import Link from 'next/link';

import hmvStyle from '@/styles/hmv.module.scss';

interface PathNavigatorProps {
    path: string;
}

const PathNavigator = (props: PathNavigatorProps): JSX.Element => {
    const { path } = props;

    if (path.length === 0) {
        // root path, return empty component
        return <></>;
    }

    const pathParts = [ '', ...path.split('/') ];

    const rootPath = '/browse';

    const linkElements = pathParts.map((element: string, index: number, allParts: string[]) => {
        if (element.length === 0) {
            // root element
            return <Link key="/" href={rootPath}>/</Link>;
        }

        const text = `/${element}`;
        const hrefPostfix = allParts.slice(0, index + 1).join('/');
        const fullHref = `${rootPath}/${hrefPostfix}`.replace('//', '/');

        return <Link key={hrefPostfix} href={fullHref}>{text}</Link>;
    });

    return <div className={hmvStyle.pathNavigator}>
        {linkElements}
    </div>;
};

export default PathNavigator;