import hmvStyle from '@/styles/hmv.module.scss';
import Link from 'next/link';

const TitleArea = (props: { title?: string }): JSX.Element => {
    return (
        <div className={hmvStyle.titleArea}>
            <Link className={hmvStyle.title} href="/">{props?.title ?? 'Home media viewer'}</Link>
            <Link className={`${hmvStyle.title} ${hmvStyle.titleMobile}`} href="/">{props?.title ?? 'HMV'}</Link>
        </div>);
}

export default TitleArea;