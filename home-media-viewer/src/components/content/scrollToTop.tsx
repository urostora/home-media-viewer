import style from '@/styles/hmv.module.scss';

const ScrollToTop: React.FC = () => {
    const onScrollToTopClicked = (e: React.MouseEvent<HTMLDivElement>): void => {
        const target = e.currentTarget;

        if (target === undefined || target.tagName.toLowerCase() !== 'div') {
            return;
        }

        let scrollableElement = target.parentElement;
        while(scrollableElement !== undefined) {
            if (scrollableElement === undefined || scrollableElement === null) {
                break;
            }

            if (scrollableElement.scrollHeight > scrollableElement.clientHeight) {
                scrollableElement.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                break;
            }

            scrollableElement = scrollableElement.parentElement;
        }
    }

    return <div className={style.scrollToTop} onClick={onScrollToTopClicked}>&#8682;</div>;
}

export default ScrollToTop;