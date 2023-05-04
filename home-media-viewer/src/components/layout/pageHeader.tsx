import MainMenu from '@/components/layout/mainMenu'
import TitleArea from '@/components/layout/titleArea';

const PageHeader = () => {
    return (
        <div className="pageHeader">
            <MainMenu />
            <TitleArea />
        </div>);
}

export default PageHeader;