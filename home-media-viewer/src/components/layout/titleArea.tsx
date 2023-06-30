import hmvStyle from '@/styles/hmv.module.scss';
import Link from 'next/link';

const TitleArea = (props: { title?: string }) => {
    return (
        <div className={hmvStyle.titleArea}>
            <Link className={hmvStyle.title} href="/">{props?.title ?? 'Home media viewer'}</Link>
        </div>);
}

export default TitleArea;