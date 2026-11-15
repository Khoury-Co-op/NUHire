'use client';

import React from 'react';

/**
 * Props:
 * - value: current value of the slider
 * - onChange?: function to handle changes in the slider's value
 */
interface RatingSliderProps {
  value: number;
  onChange?: (value: number) => void;
}

export default function RatingSlider({ value, onChange }: RatingSliderProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value);
    if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-xl">
      <div className="flex flex-row justify-between w-full text-xl mb-2">
        {[...Array(10)].map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>

      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={handleChange}
        className="slider w-full h-3 accent-blue-500 cursor-pointer"
        style={{ cursor: 'pointer' }}
      />

      <p className="mt-2 text-sm">Selected Value: {value}</p>
    </div>
  );
}
