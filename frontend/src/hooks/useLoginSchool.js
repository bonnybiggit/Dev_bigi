import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export default function useLoginSchool(enabled = true) {
  const [params] = useSearchParams();
  const [schoolId, setSchoolId] = useState(params.get("school") || "");
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!enabled || !/^[a-f\d]{24}$/i.test(schoolId)) return;
    let live = true;
    api
      .get(`/branding/schools/${schoolId}`)
      .then(({ data }) => {
        if (live) setResult({ id: schoolId, school: data.school });
      })
      .catch(() => {
        if (live) setResult({ id: schoolId, school: null });
      });
    return () => {
      live = false;
    };
  }, [schoolId, enabled]);
  const school = enabled && result?.id === schoolId ? result.school : null;
  useEffect(() => {
    document.title = school?.name
      ? `${school.name} | Sign in`
      : "School Management | Sign in";
  }, [school]);
  return {
    schoolId,
    setSchoolId,
    school,
    schoolQuery:
      enabled && schoolId ? `?school=${encodeURIComponent(schoolId)}` : "",
  };
}
