import style from '@/styles/hmv.module.scss';

interface PopupProps {
    onClose: () => void;
}

const Popup: React.FC<React.PropsWithChildren<PopupProps>> =
    (props: React.PropsWithChildren<PopupProps>): React.ReactElement =>
{
    const { onClose, children } = props;

    const onLayerClicked = (e: React.MouseEvent): void => {
        // if popup layer clicked, close popup

        if ('className' in e.target && (e.target as Element).className.includes('hmv_popup')) {
            e.stopPropagation();
            e.preventDefault();
            
            onClose();
        }
    }

    return (<div className={style.popup} onClick={onLayerClicked}>
        <div className={style.operationsBlock}>
                <div onClick={onClose}>X</div>
            </div>
        {children}
    </div>);
}

export default Popup;
