import { FC } from 'react';

interface InstructionsProps {
  instructions: string[];
  onDismiss: () => void;
  title?: string;
  buttonText?: string;
  progress: number;
}

const steps = [
  'Job Description',
  'Resume Review',
  'Resume Review Pt.2',
  'Interview Review',
  'Make Offer',
];

const ProgressBar: FC<{ progress: number }> = ({ progress }) => {
  const totalNotches = steps.length + 1;
  const percent = Math.round((progress / steps.length) * 100);

  return (
    <div className="w-full flex flex-col items-center mb-8 z-[1000]">
      <div className="w-full max-w-5xl">
        <div className="flex justify-center mb-2 px-1">
          <span className="text-xl font-medium text-northeasternBlack">Progress</span>
        </div>
        <div className="border-4 border-northeasternRed rounded-full w-full relative">
          <div className="w-full bg-gray-200 rounded-full h-10 relative overflow-visible flex">
            {steps.map((step, idx) => {
              const filled = idx < progress;
              const leftRadius = idx === 0 ? 'rounded-l-full' : '';
              const rightRadius = idx === steps.length - 1 ? 'rounded-r-full' : '';
              return (
                <div
                  key={step}
                  className={`flex-1 h-10 flex items-center justify-center font-bold text-xs transition-all duration-300
                    ${!filled ? 'bg-northeasternWhite text-northeasternRed' : 'bg-northeasternRed text-northeasternWhite'}
                    ${leftRadius} ${rightRadius} relative`}
                >
                  {step}
                </div>
              );
            })}
            <div className="absolute inset-0 h-10 w-full pointer-events-none">
              {[...Array(totalNotches)].map(
                (_, idx) =>
                  idx !== 0 &&
                  idx !== totalNotches - 1 && (
                    <div
                      key={idx}
                      className="absolute top-0 h-10 w-1 bg-northeasternRed"
                      style={{
                        left: `${(idx / (totalNotches - 1)) * 100}%`,
                        transform: 'translateX(-50%)',
                      }}
                    />
                  )
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-center mb-2 px-1">
          <span className="text-xl font-medium text-northeasternBlack">{percent}%</span>
        </div>
      </div>
    </div>
  );
};

const Instructions: FC<InstructionsProps> = ({
  instructions,
  onDismiss,
  title = 'Instructions',
  buttonText = 'Dismiss & Start',
  progress,
}) => {
  return (
    <div className="fixed top-0 left-0 w-full h-full bg-white bg-opacity-95 z-50 flex flex-col items-center justify-center">
      <ProgressBar progress={progress} />
      <div className="max-w-xl mx-auto p-8 rounded-lg shadow-lg border-4 border-red-600">
        <h2 className="text-2xl font-bold text-redHeader mb-4 text-center">{title}</h2>
        <ul className="text-lg text-northeasternBlack space-y-4 mb-6 list-disc list-inside">
          {instructions.map((instruction, index) => (
            <li key={index}>{instruction}</li>
          ))}
        </ul>
        <button
          className="w-full px-4 py-2 bg-northeasternRed text-white rounded font-bold hover:bg-redHeader transition"
          onClick={onDismiss}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
};

export default Instructions;
