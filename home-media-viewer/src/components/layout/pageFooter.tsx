import { getVersionString } from "@/utils/package";

import style from '@/styles/hmv.module.scss';

const PageFooter = (): JSX.Element =>  <div className={style.pageFooter}>{`HMV ${getVersionString()}`}</div>;

export default PageFooter;