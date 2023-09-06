import { useContext, useState } from 'react';
import hmvStyle from '@/styles/hmv.module.scss';
import Link from 'next/link';
import { AuthContext } from '../auth/authContext';

const MainMenu = () => {
    const url = window.location.href;
    const authContext = useContext(AuthContext);

    const [ isOpen, setIsOpen ] = useState<boolean>();

    const handleMenuToggle = () => {
        setIsOpen(!isOpen);
    };

    return (
        <div className={hmvStyle.mainMenu}>
            <div onClick={handleMenuToggle} className={hmvStyle.mainMenuToggle}>{isOpen ? 'X' : String.fromCodePoint(0x2630)}</div>
            <div className={`${hmvStyle.mainMenuElements} ${isOpen ? hmvStyle.isOpen : ''}`}>
                <div className={`${hmvStyle.linkItem} ${(url.includes('/album') ? hmvStyle.activeLinkItem : null)}`}>
                    <Link href="/album">Albums</Link>
                </div>
                <div className={`${hmvStyle.linkItem} ${(url.includes('/file') ? hmvStyle.activeLinkItem : null)}`}>
                    <Link href="/file">All content</Link>
                </div>
                {
                    authContext?.isAdmin === true
                    ? (<div className={`${hmvStyle.linkItem} ${(url.includes('/browse') ? hmvStyle.activeLinkItem : null)}`}>
                            <Link href="/browse">Browse</Link>
                        </div>)
                    : null
                }
            </div>
        </div>);
}

export default MainMenu;