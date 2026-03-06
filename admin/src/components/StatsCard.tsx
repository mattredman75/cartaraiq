import { ReactNode } from "react";
import { Link } from "react-router-dom";

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  color?: string;
  to?: string;
}

export default function StatsCard({
  title,
  value,
  subtitle,
  icon,
  color = "indigo",
  to,
}: Props) {
  const colorMap: Record<string, string> = {
    indigo:
      "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400",
    green: "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
    red: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  };

  const card = (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-full ${to ? "hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between h-full">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {title}
          </p>
          <p className="text-3xl font-bold mt-1 dark:text-white">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {subtitle}
            </p>
          )}
        </div>
        {icon && (
          <div
            className={`p-3 rounded-lg shrink-0 ${colorMap[color] || colorMap.indigo}`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block h-full">
        {card}
      </Link>
    );
  }

  return card;
}
