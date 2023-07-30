import MainMenu from '@/components/layout/mainMenu'
import TitleArea from '@/components/layout/titleArea';
import hmvStyle from '@/styles/hmv.module.scss';
import UserHeader from './userHeader';

const PageHeader = () => {
    return (
        <div className={hmvStyle.pageHeader}>
            <MainMenu />
            <TitleArea />
            <UserHeader />
        </div>);
}

export default PageHeader;