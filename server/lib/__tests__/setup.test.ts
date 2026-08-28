import { parseStudentList } from '../setup';

describe('parseStudentList', () => {
  it('parses comma separated rows', () => {
    const { students, errors } = parseStudentList(
      'NGSS/2026/001, Nakato, Aisha\nNGSS/2026/002, Auma, Brenda',
    );
    expect(errors).toEqual([]);
    expect(students).toHaveLength(2);
    expect(students[0]).toMatchObject({
      registrationNo: 'NGSS/2026/001', lastName: 'Nakato', firstName: 'Aisha',
    });
  });

  it('parses tab separated rows, which is what a spreadsheet pastes', () => {
    const { students, errors } = parseStudentList(
      'NGSS/2026/001\tNakato\tAisha\nNGSS/2026/002\tAuma\tBrenda',
    );
    expect(errors).toEqual([]);
    expect(students).toHaveLength(2);
    expect(students[1].firstName).toBe('Brenda');
  });

  it('ignores blank lines and stray whitespace', () => {
    const { students, errors } = parseStudentList(
      '\n  NGSS/2026/001 ,  Nakato ,  Aisha  \n\n\n',
    );
    expect(errors).toEqual([]);
    expect(students).toHaveLength(1);
    expect(students[0].lastName).toBe('Nakato');
  });

  it('reports a bad line by number and keeps the good ones', () => {
    // An office pasting 200 rows must not lose all of them to one typo.
    const { students, errors } = parseStudentList(
      'NGSS/2026/001, Nakato, Aisha\nrubbish\nNGSS/2026/003, Auma, Brenda',
    );
    expect(students).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
    expect(errors[0].problem).toMatch(/Expected registration number/);
  });

  it('catches a duplicate registration number within the paste', () => {
    const { students, errors } = parseStudentList(
      'NGSS/2026/001, Nakato, Aisha\nNGSS/2026/001, Auma, Brenda',
    );
    expect(students).toHaveLength(1);
    expect(errors[0].problem).toMatch(/Duplicate registration number/);
  });

  it('treats duplicate registration numbers case-insensitively', () => {
    const { errors } = parseStudentList(
      'ngss/2026/001, Nakato, Aisha\nNGSS/2026/001, Auma, Brenda',
    );
    expect(errors).toHaveLength(1);
  });

  it('keeps extra columns from harming the parse', () => {
    // Spreadsheets often carry a trailing class or house column.
    const { students, errors } = parseStudentList('NGSS/2026/001, Nakato, Aisha, S4, Red');
    expect(errors).toEqual([]);
    expect(students[0].firstName).toBe('Aisha');
  });

  it('returns nothing for empty input rather than failing', () => {
    expect(parseStudentList('')).toEqual({ students: [], errors: [] });
    expect(parseStudentList('   \n  \n')).toEqual({ students: [], errors: [] });
  });

  it('reports the offending text so the office can find the row', () => {
    const { errors } = parseStudentList('NGSS/2026/001, Nakato');
    expect(errors[0].text).toBe('NGSS/2026/001, Nakato');
  });
});
