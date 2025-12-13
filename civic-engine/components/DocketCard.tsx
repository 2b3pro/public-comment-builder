import React from 'react';
import Link from 'next/link';
import { DocketSummary } from '@/lib/regulations-api';

interface DocketCardProps {
  docket: DocketSummary;
  commentCount?: number;  // Number of comments drafted via this tool
}

/**
 * Format date string to "DD-MMM-YYYY" format.
 */
function formatDeadline(dateStr?: string): string {
  if (!dateStr) return 'TBD';

  // Extract just the date portion (handle both "YYYY-MM-DD" and "YYYY-MM-DDTHH:MM:SSZ" formats)
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return dateStr;

  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthName = months[parseInt(month, 10) - 1] || month;

  return `${day}-${monthName}-${year}`;
}

export const DocketCard: React.FC<DocketCardProps> = ({ docket, commentCount }) => {
  return (
    <article className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-bold text-primary bg-blue-50 px-2 py-1 rounded">
          {docket.id}
        </span>
        <span className="text-xs text-red-600 font-medium flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">event_busy</span>
          Due: {formatDeadline(docket.commentEndDate)}
        </span>
      </div>

      <h3 className="text-gray-900 font-bold text-sm leading-snug mb-2 line-clamp-2">
        {docket.title}
      </h3>

      <p className="text-xs text-gray-500 mb-3 line-clamp-2">
        {docket.agencyId} • {docket.subtype}
      </p>

      {/* Comment count badge */}
      {commentCount !== undefined && commentCount > 0 && (
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-3">
          <span className="material-symbols-outlined text--[14px]">groups</span>
          <span>{commentCount} comment{commentCount !== 1 ? 's' : ''} drafted</span>
        </div>
      )}

      <Link
        href={`/docket/${encodeURIComponent(docket.id)}`}
        className="block w-full text-center bg-gray-50 hover:bg-gray-100 text-primary font-bold py-2 rounded-lg text-sm transition-colors"
      >
        Draft Comment
      </Link>
    </article>
  );
};
