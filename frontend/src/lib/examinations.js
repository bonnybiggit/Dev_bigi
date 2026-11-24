export const markText = (value) => (value / 100).toFixed(2);
export const examStateLabels = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  published: "Published",
};
export const defaultExam = () => ({
  name: "",
  sessionId: "",
  termId: "",
  classId: "",
  subjectIds: [],
  totalMarks: 100,
  positionsEnabled: false,
  components: [
    { key: "ca", name: "Continuous Assessment", maxMarks: 40, weight: 40 },
    { key: "exam", name: "Examination", maxMarks: 60, weight: 60 },
  ],
  gradingScale: [
    { minPercent: 70, grade: "A", remark: "Excellent" },
    { minPercent: 60, grade: "B", remark: "Very good" },
    { minPercent: 50, grade: "C", remark: "Good" },
    { minPercent: 40, grade: "D", remark: "Pass" },
    { minPercent: 0, grade: "F", remark: "Needs improvement" },
  ],
});
