import { NavLink, Outlet } from "react-router-dom";
export default function FinanceLayout() {
  return (
    <>
      <nav className="finance-nav" aria-label="Finance navigation">
        {[
          ["structures", "Fee structures"],
          ["invoices", "Student invoices"],
          ["payments", "Payments"],
          ["receipts", "Receipts"],
          ["reports", "Financial reports"],
        ].map(([path, label]) => (
          <NavLink key={path} to={`/school/finance/${path}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
