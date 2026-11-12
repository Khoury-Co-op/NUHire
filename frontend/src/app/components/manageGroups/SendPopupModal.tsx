'use client';

interface SendPopupModalProps {
  groupId: number | null;
  presets: { title: string }[];
  selectedPreset: string;
  onSelectPreset: (presetTitle: string) => void;
  candidates: { id: number; name: string }[];
  selectedCandidate: string;
  onSelectCandidate: (candidateId: string) => void;
  headline: string;
  onHeadlineChange: (headline: string) => void;
  message: string;
  onMessageChange: (message: string) => void;
  isSending: boolean;
  onSend: () => void;
  onCancel: () => void;
}

export function SendPopupModal({
  groupId,
  presets,
  selectedPreset,
  onSelectPreset,
  candidates,
  selectedCandidate,
  onSelectCandidate,
  headline,
  onHeadlineChange,
  message,
  onMessageChange,
  isSending,
  onSend,
  onCancel,
}: SendPopupModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[500px] max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Send Popup to Group {groupId}</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Choose a Preset (Optional):
          </label>
          <select
            value={selectedPreset}
            onChange={(e) => onSelectPreset(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Select a Preset --</option>
            {presets.map((preset) => (
              <option key={preset.title} value={preset.title}>
                {preset.title}
              </option>
            ))}
          </select>
        </div>

        {selectedPreset && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Candidate for {selectedPreset}:
            </label>
            <select
              value={selectedCandidate}
              onChange={(e) => onSelectCandidate(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select a Candidate --</option>
              {[...candidates]
                .sort((a, b) => (a.id || 0) - (b.id || 0))
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} (ID: {candidate.id})
                  </option>
                ))}
            </select>
            {candidates.length === 0 && (
              <p className="text-sm text-gray-600 mt-1">
                This group is not currently interviewing any candidates.
              </p>
            )}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Headline:</label>
          <input
            type="text"
            placeholder="Enter popup headline"
            value={headline}
            onChange={(e) => onHeadlineChange(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Message:</label>
          <textarea
            placeholder="Enter your message here"
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
            rows={4}
          />
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onSend}
            disabled={isSending || !headline || !message}
            className={`flex-1 bg-northeasternRed text-white py-2 px-4 rounded-lg hover:bg-red-700 ${
              isSending || !headline || !message ? 'opacity-50 cursor-not-allowed' : ''
            }
            }`}
          >
            {isSending ? 'Sending...' : 'Send Popup'}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
