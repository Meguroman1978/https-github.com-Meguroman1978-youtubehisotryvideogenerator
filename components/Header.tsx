
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="py-8 px-6 border-b border-gray-800 bg-black sticky top-0 z-50">
      <div className="max-w-6xl mx-auto flex flex-col items-center gap-2">
        <h1 className="text-3xl md:text-5xl font-bold tracking-widest text-amber-500 font-serif-jp uppercase">
          Historian
        </h1>
        <p className="text-gray-400 text-sm tracking-widest italic font-serif-jp">
          Cinematic Short-Film AI Director
        </p>
      </div>
    </header>
  );
};

export default Header;
