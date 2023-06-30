import hmvStyle from '@/styles/hmv.module.scss';
import Link from 'next/link';

const MainMenu = () => {
    return (
        <div className={hmvStyle.mainMenu}>
            <div className={hmvStyle.linkItem}>
                <Link href="/album">Albums</Link>
            </div>
            <div className={hmvStyle.linkItem}>
                <Link href="/file">All content</Link>
            </div>
        </div>);
}

export default MainMenu;