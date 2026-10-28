/**
 * Utility for Payroll & Salary Period handling in Rejoy Solar ERP.
 * Provides all 12 months (January–December) and multi-year coverage
 * (previous, current, and future years) with dynamic defaulting to the current month/year.
 */

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const;

export type MonthName = (typeof MONTH_NAMES)[number];

export interface SalaryPeriodOption {
  value: string;
  label: string;
  month: MonthName;
  year: number;
  monthNumber: string; // '01' - '12'
  isCurrent: boolean;
}

export interface YearGroupedPeriods {
  year: number;
  groupLabel: string;
  options: SalaryPeriodOption[];
}

/**
 * Returns the current salary month string, e.g. "October 2026".
 */
export const getCurrentSalaryMonth = (date = new Date()): string => {
  const monthName = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  return `${monthName} ${year}`;
};

/**
 * Returns available years covering previous (3 years back), current, and future (4 years forward).
 * E.g., for 2026 -> [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].
 */
export const getAvailableYears = (baseYear = new Date().getFullYear()): number[] => {
  const years: number[] = [];
  const start = baseYear - 3;
  const end = baseYear + 4;
  for (let y = start; y <= end; y++) {
    years.push(y);
  }
  return years;
};

/**
 * Parses any salary month string like "October 2026" or "october 2026" into structured components.
 */
export const parseSalaryMonth = (
  periodStr?: string | null
): {
  month: MonthName;
  year: number;
  monthIndex: number;
  monthNumber: string;
  prefix: string; // "YYYY-MM"
} => {
  const now = new Date();
  const currentMonthIdx = now.getMonth();
  const currentYear = now.getFullYear();

  if (!periodStr || typeof periodStr !== 'string') {
    const m = MONTH_NAMES[currentMonthIdx];
    const num = String(currentMonthIdx + 1).padStart(2, '0');
    return {
      month: m,
      year: currentYear,
      monthIndex: currentMonthIdx,
      monthNumber: num,
      prefix: `${currentYear}-${num}`
    };
  }

  const parts = periodStr.trim().split(/\s+/);
  if (parts.length >= 2) {
    const rawMonth = parts[0].toLowerCase();
    const rawYear = parseInt(parts[1], 10);
    const foundIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === rawMonth);

    if (foundIdx !== -1 && !isNaN(rawYear) && rawYear > 1900 && rawYear < 3000) {
      const num = String(foundIdx + 1).padStart(2, '0');
      return {
        month: MONTH_NAMES[foundIdx],
        year: rawYear,
        monthIndex: foundIdx,
        monthNumber: num,
        prefix: `${rawYear}-${num}`
      };
    }
  }

  // Fallback to current
  const m = MONTH_NAMES[currentMonthIdx];
  const num = String(currentMonthIdx + 1).padStart(2, '0');
  return {
    month: m,
    year: currentYear,
    monthIndex: currentMonthIdx,
    monthNumber: num,
    prefix: `${currentYear}-${num}`
  };
};

/**
 * Formats month and year into standard salary period string: "October 2026".
 */
export const formatSalaryMonth = (month: string, year: number | string): string => {
  return `${month} ${year}`;
};

/**
 * Generates options grouped by year for <optgroup> rendering.
 * Order: Current Year first, then Future Years, then Previous Years (or chronological).
 */
export const getYearGroupedSalaryPeriods = (baseDate = new Date()): YearGroupedPeriods[] => {
  const currentYear = baseDate.getFullYear();
  const currentMonthIdx = baseDate.getMonth();
  const years = getAvailableYears(currentYear);

  // Sort years so Current Year is first, then future (asc), then past (desc) for convenient admin workflow
  const sortedYears = [...years].sort((a, b) => {
    if (a === currentYear) return -1;
    if (b === currentYear) return 1;
    if (a > currentYear && b > currentYear) return a - b; // future asc
    if (a < currentYear && b < currentYear) return b - a; // past desc
    return a > b ? -1 : 1;
  });

  return sortedYears.map(year => {
    let groupLabel = `${year}`;
    if (year === currentYear) {
      groupLabel = `Current Year (${year})`;
    } else if (year > currentYear) {
      groupLabel = `Future Year (${year})`;
    } else {
      groupLabel = `Previous Year (${year})`;
    }

    const options: SalaryPeriodOption[] = MONTH_NAMES.map((monthName, idx) => {
      const isCurrent = year === currentYear && idx === currentMonthIdx;
      const monthNum = String(idx + 1).padStart(2, '0');
      return {
        value: `${monthName} ${year}`,
        label: `${monthName} ${year}${isCurrent ? ' (Current Month)' : ''}`,
        month: monthName,
        year,
        monthNumber: monthNum,
        isCurrent
      };
    });

    return {
      year,
      groupLabel,
      options
    };
  });
};

/**
 * Flat list of all available period strings.
 */
export const getAllSalaryPeriodOptions = (baseDate = new Date()): string[] => {
  const grouped = getYearGroupedSalaryPeriods(baseDate);
  const result: string[] = [];
  grouped.forEach(g => {
    g.options.forEach(opt => {
      result.push(opt.value);
    });
  });
  return result;
};
