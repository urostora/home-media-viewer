import MainMenu from '@/components/layout/mainMenu'
import TitleArea from '@/components/layout/titleArea';
import hmvStyle from '@/styles/hmv.module.scss';

const PageHeader = () => {
    return (
        <div className={hmvStyle.pageHeader}>
            <MainMenu />
            <TitleArea />
        </div>);
}

export default PageHeader;