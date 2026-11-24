import { Wallet } from "lucide-react";
import { money, financeLabels } from "../lib/finance";
export default function FinanceSummary({ totals }) {
  return (
    <div className="stats-grid finance-stats">
      {Object.entries(financeLabels).map(([key, title]) => (
        <article className="stat-card" key={key}>
          <div className="stat-top">
            <span>{title}</span>
            <span className="stat-icon blue">
              <Wallet size={18} />
            </span>
          </div>
          <strong className="finance-value">{money(totals[key])}</strong>
        </article>
      ))}
    </div>
  );
}
