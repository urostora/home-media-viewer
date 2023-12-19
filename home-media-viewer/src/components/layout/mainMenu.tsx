import { useContext, useState } from 'react';
import Link from 'next/link';

import { AuthContext } from '../auth/authContext';

import hmvStyle from '@/styles/hmv.module.scss';

const MainMenu = (): JSX.Element => {
    const url = window.location.href;
    const authContext = useContext(AuthContext);

    const [ isOpen, setIsOpen ] = useState<boolean>(false);

    const handleMenuToggle = (): void => {
        setIsOpen(!isOpen);
    };

    const closeMenu = (): void => {
        setIsOpen(false);
    }

    return (
        <div className={hmvStyle.mainMenu}>
            <div onClick={handleMenuToggle} className={hmvStyle.mainMenuToggle}>{isOpen ? 'X' : String.fromCodePoint(0x2630)}</div>
            <div className={`${hmvStyle.mainMenuElements} ${isOpen ? hmvStyle.isOpen : ''}`}>
                <div className={`${hmvStyle.linkItem} ${(url.includes('/album') ? hmvStyle.activeLinkItem : null)}`}>
                    <Link href="/album" onClick={closeMenu}>Albums</Link>
                </div>
                <div className={`${hmvStyle.linkItem} ${(url.includes('/search') ? hmvStyle.activeLinkItem : null)}`}>
                    <Link href="/search" onClick={closeMenu}>Search</Link>
                </div>
                {
                    authContext?.isAdmin === true
                    ? (<div className={`${hmvStyle.linkItem} ${(url.includes('/browse') ? hmvStyle.activeLinkItem : null)}`}>
                        <Link href="/browse" onClick={closeMenu}>Browse</Link>
                    </div>)
                    : null
                }
                {
                    authContext?.isAdmin === true
                    ? (<div className={`${hmvStyle.linkItem} ${(url.includes('/user') ? hmvStyle.activeLinkItem : null)}`}>
                        <Link href="/user" onClick={closeMenu}>Users</Link>
                    </div>)
                    : null
                }
            </div>
        </div>);
}

export default MainMenu;