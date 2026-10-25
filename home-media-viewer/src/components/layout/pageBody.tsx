import { type JSX, type ReactNode } from 'react';

import style from '@/styles/hmv.module.scss';

const PageBody = (props: { children?: ReactNode }): JSX.Element => {
    return (
        <div className={style.pageBody}>
            {props.children}
        </div>);
}

export default PageBody;