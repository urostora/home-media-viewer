import style from '@/styles/hmv.module.scss';

export interface YearSeasonFilterPropsType {
    onYearSelected?:(year: number) => void;
    onSeasonSelected?:(fromMonth: number, toMonth: number) => void;
}

const SHOW_YEARS = 10;

const YearSeasonFilter = (props: YearSeasonFilterPropsType): JSX.Element => {
    const { onYearSelected, onSeasonSelected } = props; 

    const onYearButtonSelected = (e: React.SyntheticEvent<HTMLButtonElement>): void => {
        if (typeof onYearSelected !== 'function') {
            return;
        }

        const yearSelectedText = e.currentTarget.attributes.getNamedItem('data-year')?.value ?? '';
        const yearSelected = Number.parseInt(yearSelectedText);
        if (!Number.isNaN(yearSelected)) {
            onYearSelected(yearSelected);
        }
    }

    const onSeasonButtonSelected = (e: React.SyntheticEvent<HTMLButtonElement>): void => {
        if (typeof onSeasonSelected !== 'function') {
            return;
        }

        const monthSelectedText = e.currentTarget.attributes.getNamedItem('data-month')?.value ?? '';
        const monthSelected = Number.parseInt(monthSelectedText);
        if (!Number.isNaN(monthSelected)) {
            onSeasonSelected(monthSelected, monthSelected + 2);
        }
    }

    const years = [];
    const currentYear = new Date().getFullYear();
    for(let counter = 0; counter < SHOW_YEARS; counter++) {
        years.push(currentYear - counter);
    }

    const yearButtons: JSX.Element[] = years.map(year => <button key={year} className={style.buttonElement} data-year={year} onClick={onYearButtonSelected}>{year}</button>);
    const seasonButtons = [1, 4, 7, 10].map((fromMonth) =>
        <button
            key={fromMonth}
            className={style.buttonElement}
            data-month={fromMonth}
            onClick={onSeasonButtonSelected}>
                {`${fromMonth.toString().padStart(2, '0')}-${(fromMonth + 2).toString().padStart(2, '0')}`}
            </button>);

    return (<>
        <div className={style.horizontalScrollableContainer}>{yearButtons}</div>
        <div className={style.horizontalScrollableContainer}>{seasonButtons}</div>
    </>);
}

export default YearSeasonFilter;