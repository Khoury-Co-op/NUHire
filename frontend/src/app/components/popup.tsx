'use client';

import React from 'react';

interface PopupProps {
  headline: string;
  message: string;
  onDismiss: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  busy?: boolean;
}

const Popup = ({
  headline,
  message,
  onDismiss,
  onConfirm,
  confirmLabel = 'Confirm',
  busy = false,
}: PopupProps) => {
  return (
    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white border-4 border-northeasternRed p-8 w-96 rounded-md shadow-lg z-50">
      <h2 className="font-bold text-black text-2xl mb-4">{headline}</h2>
      <p className="text-black text-lg mb-6">{message}</p>
      {onConfirm ? (
        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            disabled={busy}
            className="flex-1 px-4 py-2 border border-gray-300 text-black rounded hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 px-4 py-2 bg-northeasternRed text-white rounded hover:bg-gray-700 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      ) : (
        <button
          onClick={onDismiss}
          className="w-full px-4 py-2 bg-northeasternRed text-white rounded hover:bg-gray-700"
        >
          Dismiss
        </button>
      )}
    </div>
  );
};

export default Popup;
