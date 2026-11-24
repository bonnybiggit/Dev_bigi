import { Construction } from "lucide-react";
export default function ComingSoon({ module }) {
  const title = module.charAt(0).toUpperCase() + module.slice(1);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SCHOOL WORKSPACE</div>
          <h1>{title}</h1>
          <p>Your school’s {title.toLowerCase()} workspace.</p>
        </div>
      </div>
      <section className="panel empty-state">
        <Construction size={36} />
        <h3>{title} is coming soon</h3>
        <p>This module will be available in a future milestone.</p>
      </section>
    </>
  );
}
