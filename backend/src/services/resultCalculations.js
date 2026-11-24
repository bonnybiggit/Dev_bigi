export const roundRatio = (numerator, denominator) =>
  Number(
    (BigInt(numerator) * 2n + BigInt(denominator)) / (BigInt(denominator) * 2n),
  );
export function calculateResult(exam, scores) {
  let numerator = 0n,
    denominator = 1n;
  for (const component of exam.components) {
    const n =
      BigInt(Math.round(scores[component.key] * 100)) *
      BigInt(component.weight) *
      BigInt(exam.totalMarks);
    const d = BigInt(component.maxMarks) * 100n;
    numerator = numerator * d + n * denominator;
    denominator *= d;
  }
  const totalHundredths = roundRatio(numerator, denominator);
  const percentHundredths = roundRatio(
    BigInt(totalHundredths) * 100n,
    exam.totalMarks,
  );
  const band = [...exam.gradingScale]
    .sort((a, b) => b.minPercent - a.minPercent)
    .find((item) => totalHundredths >= item.minPercent * exam.totalMarks);
  return {
    totalHundredths,
    percentHundredths,
    grade: band.grade,
    remark: band.remark,
  };
}
export function classSummaries(exam, results) {
  const students = new Map(),
    subjects = new Map();
  for (const result of results) {
    const id = String(result.studentId),
      subjectId = String(result.subjectId);
    const row = students.get(id) || {
      studentId: id,
      studentName: result.studentName,
      admissionNumber: result.admissionNumber,
      arm: result.arm,
      totalHundredths: 0,
      percentSum: 0,
      subjectCount: 0,
    };
    row.totalHundredths += result.totalHundredths;
    row.percentSum += result.percentHundredths;
    row.subjectCount++;
    students.set(id, row);
    const group = subjects.get(subjectId) || {
      subjectId,
      name: result.subjectName,
      total: 0,
      percent: 0,
      count: 0,
    };
    group.total += result.totalHundredths;
    group.percent += result.percentHundredths;
    group.count++;
    subjects.set(subjectId, group);
  }
  const complete = [...students.values()]
    .filter((row) => row.subjectCount === exam.subjects.length)
    .map((row) => ({
      ...row,
      averageHundredths: roundRatio(row.percentSum, row.subjectCount),
    }))
    .sort(
      (a, b) =>
        b.averageHundredths - a.averageHundredths ||
        a.studentId.localeCompare(b.studentId),
    );
  let rank = 0,
    previous = null;
  for (const [index, row] of complete.entries()) {
    if (row.averageHundredths !== previous) rank = index + 1;
    previous = row.averageHundredths;
    row.position = exam.positionsEnabled ? rank : null;
  }
  return {
    students: complete,
    subjects: [...subjects.values()].map((row) => ({
      subjectId: row.subjectId,
      name: row.name,
      averageHundredths: roundRatio(row.percent, row.count),
      averageTotalHundredths: roundRatio(row.total, row.count),
      count: row.count,
    })),
  };
}
