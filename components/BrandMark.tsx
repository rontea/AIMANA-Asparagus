import React from 'react';

interface BrandMarkProps {
  className?: string;
  imageClassName?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  label?: string;
}

const BrandMark: React.FC<BrandMarkProps> = ({
  className = '',
  imageClassName = '',
  showWordmark = true,
  wordmarkClassName = '',
  label = 'AIMANA'
}) => {
  return (
    <div className={`flex items-center ${className}`.trim()}>
      <img
        src="/brand/aimana-system-logo.png"
        alt={`${label} logo`}
        className={`object-contain ${imageClassName}`.trim()}
      />
      {showWordmark && (
        <span className={wordmarkClassName}>{label}</span>
      )}
    </div>
  );
};

export default BrandMark;
