import React from 'react';

export function CREmblem({ className = 'w-16 h-16' }) {
  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <img
        src="/logo.png"
        alt="SmartAttend logo"
        className="w-full h-full object-contain select-none"
      />
    </div>
  );
}

export function CRLogo({ light = false, size = 'md', className = '' }) {
  const isLg = size === 'lg';
  return (
    <div className={`text-center select-none ${className}`}>
      <div className="flex justify-center">
        <CREmblem className={isLg ? 'w-20 h-20 sm:w-24 sm:h-24' : 'w-14 h-14 sm:w-16 sm:h-16'} />
      </div>
      <h2
        className={`font-black tracking-wide uppercase mt-2 leading-none ${
          isLg ? 'text-2xl sm:text-[28px]' : 'text-lg sm:text-[21px]'
        } ${light ? 'text-white' : 'text-[#102B60]'}`}
      >
        CLASS REPRESENTATIVE
      </h2>
      <div className="flex items-center justify-center gap-2 sm:gap-3 mt-1.5">
        <div className={`h-[2px] w-7 sm:w-10 rounded-full ${light ? 'bg-blue-300' : 'bg-[#1877E8]'}`}></div>
        <span
          className={`text-[11px] sm:text-[13px] font-black tracking-[0.25em] uppercase leading-none ${
            light ? 'text-blue-200' : 'text-[#1877E8]'
          }`}
        >
          ASSIST
        </span>
        <div className={`h-[2px] w-7 sm:w-10 rounded-full ${light ? 'bg-blue-300' : 'bg-[#1877E8]'}`}></div>
      </div>
    </div>
  );
}
