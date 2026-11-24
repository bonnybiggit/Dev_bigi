export const attendanceLabels = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};
export const attendanceToday = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
};
export const attendancePercent = (value) =>
  value === null || value === undefined ? "—" : `${value}%`;
