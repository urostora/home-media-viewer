import { type DateFilter } from '@/types/api/generalTypes';
import { type Prisma } from '@prisma/client';

export const getDateObject = (dateTimeString: string | undefined | null): Date | null => {
  if (typeof dateTimeString !== 'string' || dateTimeString.length < 8) {
    return null;
  }

  const rex =
    /(?<year>(?:19|20)\d{2})\D?(?<month>\d{1,2})\D?(?<day>\d{1,2})(?:\D{0,2})(?<hour>\d{1,2})?(?:\D?(?<min>\d{1,2})(?:\D?(?<sec>\d{1,2})?)?)?/i;
  const match = rex.exec(dateTimeString);

  if (match?.groups === undefined) {
    return null;
  }

  const ret = new Date(
    Number.parseInt(match.groups.year),
    Number.parseInt(match.groups.month ?? 1) - 1,
    Number.parseInt(match.groups.day ?? 1),
    Number.parseInt(match.groups.hour ?? 0),
    Number.parseInt(match.groups.min ?? 0),
    Number.parseInt(match.groups.sec ?? 0),
  );

  return ret;
};

export const getDateTimeFilter = (obj?: DateFilter | null): Prisma.DateTimeFilter | undefined => {
  if (typeof obj !== 'object') {
    return undefined;
  }

  if (typeof obj?.equals === 'string') {
    const equalsDate = getDateObject(obj?.equals);
    if (equalsDate != null) {
      return { equals: equalsDate };
    }
  }

  if (typeof obj?.from === 'string' || typeof obj?.to === 'string') {
    const ret: Prisma.DateTimeFilter = {};
    const fromDate = getDateObject(obj?.from);
    const toDate = getDateObject(obj?.to);

    if (fromDate != null || toDate != null) {
      if (fromDate != null) {
        ret.gte = fromDate;
      }
      if (toDate != null) {
        ret.lt = toDate;
      }

      return ret;
    }
  }

  return undefined;
};
