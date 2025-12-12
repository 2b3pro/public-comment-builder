import React from 'react';

interface FooterProps {
  onNext: () => void;
  nextLabel?: string;
  isNextDisabled?: boolean;
  currentStep?: number;
  totalSteps?: number;
}

export const Footer: React.FC<FooterProps> = ({ 
  onNext, 
  nextLabel = "Next", 
  isNextDisabled = false,
  currentStep = 1,
  totalSteps = 4
}) => {
  return (
    <footer className="bg-white border-t border-gray-200 p-4 pb-8 flex flex-col gap-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 shrink-0">
      {/* Progress Indicators */}
      <div className="flex w-full flex-row items-center justify-center gap-2">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <div 
            key={index}
            className={`h-2 rounded-full transition-all duration-300 ${
              index + 1 === currentStep 
                ? "w-8 bg-primary" 
                : index + 1 < currentStep 
                  ? "w-2 bg-primary/30" 
                  : "w-2 bg-gray-300"
            }`}
          />
        ))}
      </div>
      
      {/* Next Button */}
      <button 
        onClick={onNext}
        disabled={isNextDisabled}
        className={`w-full flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-white shadow-lg shadow-blue-500/30 transition-all duration-200 ${
          isNextDisabled 
            ? "bg-gray-400 cursor-not-allowed shadow-none" 
            : "bg-primary hover:bg-blue-600 hover:shadow-blue-500/40 active:scale-[0.98]"
        }`}
      >
        <span className="text-base font-bold tracking-wide">{nextLabel}</span>
        <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
      </button>
    </footer>
  );
};
