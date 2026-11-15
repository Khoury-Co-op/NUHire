import React, { useState } from 'react';

type TabProps = {
  children: React.ReactElement<{ title: string }>[];
};

const Tabs: React.FC<TabProps> = ({ children }) => {
  const [selectedTab, setSelectedTab] = useState(0);

  return (
    <div>
      <div className="flex mb-4">
        {children.map((tab, idx) => (
          <button
            key={idx}
            className={`flex-1 py-2 px-4 font-bold rounded-t-lg border-b-2 transition-colors
              ${
                selectedTab === idx
                  ? 'bg-northeasternRed text-white border-northeasternRed'
                  : 'bg-northeasternWhite text-northeasternRed border-gray-300 hover:bg-springWater'
              }`}
            onClick={() => setSelectedTab(idx)}
          >
            {tab.props.title}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-center min-h-[60vh]">{children[selectedTab]}</div>
    </div>
  );
};

export default Tabs;
