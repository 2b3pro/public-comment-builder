import React from 'react';
import { clsx } from 'clsx';

interface ImpactToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const ImpactToggle: React.FC<ImpactToggleProps> = ({ 
  label, 
  description, 
  checked, 
  onChange 
}) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col pr-4">
        <span className="font-medium text-gray-900">{label}</span>
        <span className="text-xs text-gray-500 mt-0.5">{description}</span>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input 
          type="checkbox" 
          className="sr-only peer" 
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
      </label>
    </div>
  );
};
