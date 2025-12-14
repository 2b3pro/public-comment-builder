import React, { useState } from 'react';
import { clsx } from 'clsx';

interface SubmissionGuidelinesProps {
  docketId: string;
  agencyName: string;
  instructions?: string;
  documentUrl?: string;
  deadline?: string; // Human-readable deadline or ISO date
  className?: string;
}

export const SubmissionGuidelines: React.FC<SubmissionGuidelinesProps> = ({
  docketId,
  agencyName,
  instructions,
  documentUrl,
  deadline,
  className
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={clsx("bg-blue-50 border border-blue-100 rounded-xl overflow-hidden", className)}>
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-blue-100/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 text-primary p-2 rounded-lg">
            <span className="material-symbols-outlined">assignment_turned_in</span>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-gray-900">Submission Requirements</span>
            <span className="text-xs text-blue-600 font-medium">
              Must include Docket No. {docketId}
            </span>
          </div>
        </div>
        <span className={clsx(
          "material-symbols-outlined text-blue-400 transition-transform",
          isOpen ? "rotate-180" : ""
        )}>
          expand_more
        </span>
      </div>

      {isOpen && (
        <div className="p-4 pt-0 text-sm text-gray-700 animate-fade-in">
          <div className="mb-3">
            <p className="font-medium mb-1">Required Headers:</p>
            <ul className="list-disc pl-5 space-y-1 text-gray-600">
              <li>Agency: <strong>{agencyName}</strong></li>
              <li>Docket No.: <strong>{docketId}</strong></li>
            </ul>
          </div>

          {deadline && (
            <div className="mt-3 pt-3 border-t border-blue-200/50">
              <p className="font-medium mb-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-red-500 text-base">schedule</span>
                Comment Deadline:
              </p>
              <p className="text-gray-700 font-medium">{deadline}</p>
            </div>
          )}

          {instructions && (
            <div className="mt-3 pt-3 border-t border-blue-200/50">
              <p className="font-medium mb-1">Official Instructions:</p>
              <div className="prose prose-sm text-gray-600 max-w-none whitespace-pre-wrap">
                {instructions}
              </div>
            </div>
          )}
          
          <div className="mt-3 bg-white p-3 rounded border border-blue-100 text-xs text-gray-500">
            <span className="font-bold">Note:</span> Our drafter automatically includes these required details in your comment header.
          </div>

          <a
            href="https://www.regulations.gov/commenting-guidance"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center gap-2 text-xs text-primary hover:underline"
          >
            <span className="material-symbols-outlined text-sm">open_in_new</span>
            Official commenting guidance from Regulations.gov
          </a>
        </div>
      )}
    </div>
  );
};
