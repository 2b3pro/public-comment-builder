import React from 'react';
import { clsx } from 'clsx';
import { Position } from '@/lib/ai-generator';

// Legacy export for backward compatibility
export type StanceType = Position;

interface StanceSelectorProps {
  value: StanceType | null;
  onChange: (value: StanceType) => void;
}

export const StanceSelector: React.FC<StanceSelectorProps> = ({ value, onChange }) => {
  const options: { value: StanceType; label: string; icon: string }[] = [
    { value: 'support', label: 'Support', icon: 'thumb_up' },
    { value: 'mixed', label: 'Mixed', icon: 'thumbs_up_down' },
    { value: 'oppose', label: 'Oppose', icon: 'thumb_down' },
  ];

  return (
    <div className="w-full">
      <h2 className="text-gray-900 tracking-tight text-[28px] font-bold leading-tight text-left pb-4">
        What is your position?
      </h2>
      
      <div className="flex w-full bg-gray-200 rounded-xl p-1 h-14 relative">
        {options.map((option) => {
          const isSelected = value === option.value;
          return (
            <label key={option.value} className="flex-1 relative cursor-pointer group">
              <input 
                type="radio" 
                name="stance" 
                className="peer sr-only" 
                value={option.value}
                checked={isSelected}
                onChange={() => onChange(option.value)}
              />
              <div className={clsx(
                "w-full h-full rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-200",
                isSelected 
                  ? "bg-white text-primary shadow-sm" 
                  : "text-gray-500 hover:text-gray-700"
              )}>
                <span className="mr-2 material-symbols-outlined text-[20px]">{option.icon}</span>
                {option.label}
              </div>
            </label>
          );
        })}
      </div>
      
      <p className="text-gray-500 text-sm mt-3 px-1">
        {value === 'mixed' && "Selecting \"Mixed\" allows you to provide feedback on specific aspects without fully endorsing or rejecting the rule."}
        {value === 'support' && "You generally agree with the proposal but may have suggestions for improvement."}
        {value === 'oppose' && "You believe this proposal is flawed, unnecessary, or harmful in its current form."}
        {!value && "Select an option to continue."}
      </p>
    </div>
  );
};
