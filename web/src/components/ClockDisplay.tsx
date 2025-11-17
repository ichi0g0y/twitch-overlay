import React from 'react';
import { useClock } from '../hooks/useClock';
import { CalendarIcon, ClockIcon, LocationIcon } from './ClockIcons';

interface ClockDisplayProps {
  showLocation?: boolean;
  showDate?: boolean;
  showTime?: boolean;
  showIcons?: boolean;
}

const ClockDisplay: React.FC<ClockDisplayProps> = ({
  showLocation = true,
  showDate = true,
  showTime = true,
  showIcons = true
}) => {
  const { year, month, date, day, hour, min, flashing } = useClock();

  const today = `${year}.${month}.${date} ${day}`;

  return (
    <div className="clock-container text-2xl">
      {(showLocation || showDate || showTime) && (
        <div className="clock">
          {showLocation && (
            <>
              {showIcons ? <LocationIcon /> : <div className="icon-placeholder" />}
              <p className="locate">Hyogo,Japan</p>
            </>
          )}
          {showDate && (
            <>
              {showIcons ? <CalendarIcon /> : <div className="icon-placeholder" />}
              <p className="clock-date">{today}</p>
            </>
          )}
          {showTime && (
            <>
              {showIcons ? <ClockIcon /> : <div className="icon-placeholder" />}
              <p className="clock-hour">{hour}</p>
              <p className="clock-separator" style={{ opacity: flashing ? 1 : 0 }}>
                :
              </p>
              <p className="clock-min">{min}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ClockDisplay;