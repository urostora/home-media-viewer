import style from '@/styles/hmv.module.scss';

const ScrollToTop: React.FC = () => (
  <button
    type="button"
    className={style.scrollToTop}
    aria-label="Scroll to top"
    onClick={() =>
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      })
    }
  >
    ↑
  </button>
);
export default ScrollToTop;
