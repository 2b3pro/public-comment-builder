import React, { useState } from 'react';
import { clsx } from 'clsx';

export interface ReasoningOption {
  id: string;
  label: string;
  expansion?: string; // Full text for the comment
}

interface ReasoningCardProps {
  title: string;
  icon: string;
  iconColorClass: string; // e.g., "bg-blue-100 text-primary"
  options: ReasoningOption[];
  selectedOptions: string[];
  onChange: (optionId: string, isChecked: boolean) => void;
  defaultExpanded?: boolean;
  onRegenerate?: () => void; // Optional callback to regenerate this card's arguments
  isRegenerating?: boolean;
  customText?: string; // User's custom input for this card
  onCustomTextChange?: (text: string) => void; // Callback when custom text changes
}

export const ReasoningCard: React.FC<ReasoningCardProps> = ({
  title,
  icon,
  iconColorClass,
  options,
  selectedOptions,
  onChange,
  defaultExpanded = false,
  onRegenerate,
  isRegenerating = false,
  customText = '',
  onCustomTextChange
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Calculate how many items are selected in this card
  const selectedCount = options.filter(opt => selectedOptions.includes(opt.id)).length;

  return (
    <div className={clsx(
      "mb-4 bg-white rounded-xl shadow-sm border overflow-hidden transition-all duration-200",
      isExpanded ? "border-gray-200" : "border-gray-100 hover:border-primary/30"
    )}>
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx(
          "flex items-center justify-between p-4 cursor-pointer select-none",
          isExpanded ? "bg-gray-50/50 border-b border-gray-100" : ""
        )}
      >
        <div className="flex items-center gap-3">
          <div className={clsx("p-2 rounded-lg flex items-center justify-center", iconColorClass)}>
            <span className="material-symbols-outlined">{icon}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-gray-900">{title}</span>
            {!isExpanded && selectedCount > 0 && (
              <span className="text-xs text-primary font-medium">{selectedCount} selected</span>
            )}
          </div>
        </div>
        <span className={clsx(
          "material-symbols-outlined text-gray-400 transition-transform duration-200",
          isExpanded ? "transform rotate-180" : ""
        )}>
          expand_more
        </span>
      </div>

      {isExpanded && (
        <div className={clsx(
          "p-4 bg-white animate-fade-in",
          isRegenerating ? "opacity-50 pointer-events-none" : ""
        )}>
          {isRegenerating ? (
            <div className="flex items-center justify-center py-8">
              <span className="material-symbols-outlined animate-spin text-primary mr-2">progress_activity</span>
              <span className="text-gray-500 text-sm">Generating new arguments...</span>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {options.map((option) => {
                  const isChecked = selectedOptions.includes(option.id);
                  return (
                    <label key={option.id} className="flex items-start gap-3 cursor-pointer group">
                      <div className="relative flex items-center mt-0.5">
                        <input
                          type="checkbox"
                          className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-300 bg-white transition-all checked:border-primary checked:bg-primary"
                          checked={isChecked}
                          onChange={(e) => onChange(option.id, e.target.checked)}
                        />
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 pointer-events-none material-symbols-outlined text-[16px]">check</span>
                      </div>
                      <div className="flex-1">
                        <span className={clsx(
                          "text-sm leading-snug transition-colors block",
                          isChecked ? "text-gray-900 font-medium" : "text-gray-700"
                        )}>
                          {option.label}
                        </span>
                        {/* Show full expansion text when selected */}
                        {option.expansion && isChecked && (
                          <div className="mt-2 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                            <p className="text-xs text-gray-600 leading-relaxed">
                              {option.expansion}
                            </p>
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* User's custom input for this topic */}
              {onCustomTextChange && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <label className="block">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-gray-400 text-[18px]">edit_note</span>
                      <span className="text-xs font-medium text-gray-500">Add your own perspective on {title.toLowerCase()}</span>
                    </div>
                    <textarea
                      className="w-full p-3 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none placeholder:text-gray-400"
                      rows={3}
                      placeholder={`Share your experience or specific concerns related to ${title.toLowerCase()}...`}
                      value={customText}
                      onChange={(e) => onCustomTextChange(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </label>
                </div>
              )}

              {/* Regenerate button */}
              {onRegenerate && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRegenerate();
                  }}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-gray-500 hover:text-primary hover:bg-gray-50 rounded-lg transition-colors border border-dashed border-gray-200 hover:border-primary/30"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  Generate different arguments
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
