import React from 'react';
import ClockDisplay from './ClockDisplay';

const ClockPage: React.FC = () => {
  // URLパラメータから表示設定を取得
  const params = new URLSearchParams(window.location.search);
  const showStats = params.get('stats') !== 'false';
  const showLocation = params.get('location') !== 'false';
  const showDate = params.get('date') !== 'false';

  return (
    <div className="h-screen relative overflow-hidden" style={{ backgroundColor: 'transparent' }}>
      <div className="fixed top-0 right-0 z-10">
        <ClockDisplay
          showLocation={showLocation}
          showDate={showDate}
          showTime={true}
          showStats={showStats}
        />
      </div>
    </div>
  );
};

export default ClockPage;