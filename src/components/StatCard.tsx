import React from "react";

export function StatCard({
  label, value, sub, accent, icon,
}: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean; icon?: React.ReactNode }) {
  return (
    <div className={"card" + (accent ? " accent" : "")}>
      <div className="card-top">
        <span className="card-label">{label}</span>
        {icon && <span className="card-icon">{icon}</span>}
      </div>
      <div className="card-value">{value}</div>
      {sub && <div className="card-sub">{sub}</div>}
    </div>
  );
}
