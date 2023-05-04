import { ReactNode } from 'react';

import MainMenu from '@/components/layout/mainMenu'
import TitleArea from '@/components/layout/titleArea';

const PageBody = (props: { children?: ReactNode }) => {
    return (
        <div className="pageBody">
            {props.children}
        </div>);
}

export default PageBody;