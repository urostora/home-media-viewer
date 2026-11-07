import Modal from './modal';

interface PopupProps {
  onClose: () => void;
  title?: string;
}

const Popup: React.FC<React.PropsWithChildren<PopupProps>> = (
  props: React.PropsWithChildren<PopupProps>,
): React.ReactElement => {
  const { onClose, children, title = 'Media information' } = props;
  return (
    <Modal title={title} onClose={onClose}>
      {children}
    </Modal>
  );
};

export default Popup;
