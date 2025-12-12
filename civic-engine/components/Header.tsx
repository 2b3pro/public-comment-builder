import React from 'react';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  onInfo?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  title = "Proposed Rule", 
  subtitle = "Public Commenting",
  onBack,
  onInfo
}) => {
  return (
    <header className="flex items-center bg-white p-4 pb-2 justify-between shadow-sm z-10 shrink-0">
      <button 
        onClick={onBack}
        className="text-gray-900 flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <span className="material-symbols-outlined">arrow_back</span>
      </button>
      
      <div className="flex flex-col flex-1 px-2 text-center">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{subtitle}</span>
        <h2 className="text-gray-900 text-base font-bold leading-tight truncate">{title}</h2>
      </div>
      
      <button 
        onClick={onInfo}
        className="text-primary flex size-12 shrink-0 items-center justify-center cursor-pointer"
      >
        <span className="material-symbols-outlined">info</span>
      </button>
    </header>
  );
};
