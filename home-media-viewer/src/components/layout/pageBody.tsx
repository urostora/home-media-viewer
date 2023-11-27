import { ReactNode } from 'react';

const PageBody = (props: { children?: ReactNode }) => {
    return (
        <div className="pageBody">
            {props.children}
        </div>);
}

export default PageBody;