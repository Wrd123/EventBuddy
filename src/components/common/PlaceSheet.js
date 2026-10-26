import React from 'react';
import { Navigation } from 'lucide-react';
import Button from './Button';
import CitySearch from './CitySearch';
import Sheet, { useSheet } from './Sheet';
import { usePlace } from '../../hooks/usePlace';

// Bottom sheet for choosing where to look for events: the phone's location
// or a typed city / ZIP code.
const PlaceSheet = ({ onClose }) => (
  <Sheet title="Where should we look?" onClose={onClose} className="p-4">
    <PlaceChoices />
  </Sheet>
);

// Its own component so it can close the sheet with the exit animation once
// a place is chosen
const PlaceChoices = () => {
  const { place, busy, error, locateDevice } = usePlace();
  const { close } = useSheet();

  return (
    <>
      <p className="text-sm text-muted mb-4">
        {place ? `Showing events near ${place.label}.` : 'Find concerts, games and shows near you.'}
        {' '}Your exact location never leaves your phone.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-3 py-2 rounded-xl mb-3 text-sm" role="alert">{error}</div>
      )}

      <Button onClick={async () => { if (await locateDevice()) close(); }} fullWidth size="lg" disabled={busy} icon={<Navigation size={18} />}>
        {busy ? 'Finding you...' : 'Use my current location'}
      </Button>

      <div className="flex items-center my-4 text-xs text-faint">
        <span className="flex-1 h-px bg-line" />
        <span className="px-3">or</span>
        <span className="flex-1 h-px bg-line" />
      </div>

      <CitySearch onFound={close} />
    </>
  );
};

export default PlaceSheet;
