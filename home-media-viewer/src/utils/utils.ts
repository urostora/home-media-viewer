export const getDateObject = (dateTimeString: string): Date | null => {
  if (typeof dateTimeString !== 'string' || dateTimeString.length < 8) {
    return null;
  }

  const rex =
    /(?<year>\d{4})\D?(?<month>\d{1,2})\D?(?<day>\d{1,2})(?:\D{0,2})(?<hour>\d{1,2})(?:\D?(?<min>\d{1,2})(?:\D?(?<sec>\d{1,2})))/i;
  const match = rex.exec(dateTimeString);

  if (!match || !match.groups) {
    return null;
  }

  try {
    const ret = new Date(
      Number.parseInt(match.groups['year']),
      Number.parseInt(match.groups['month'] ?? 1) - 1,
      Number.parseInt(match.groups['day'] ?? 1),
      Number.parseInt(match.groups['hour'] ?? 0),
      Number.parseInt(match.groups['min'] ?? 0),
      Number.parseInt(match.groups['sec'] ?? 0),
    );

    return ret;
  } catch (e) {
    return null;
  }
};
