import React from 'react';
import { Navigation, X } from 'lucide-react';
import Button from './Button';
import CitySearch from './CitySearch';
import { usePlace } from '../../hooks/usePlace';

// Bottom sheet for choosing where to look for events: the phone's location
// or a typed city / ZIP code. The parent must be position: relative.
const PlaceSheet = ({ onClose }) => {
  const { place, busy, error, locateDevice } = usePlace();

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end sheet-scrim" role="dialog" aria-modal="true" aria-labelledby="place-title">
      <div className="sheet p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 id="place-title" className="text-lg font-bold">Where should we look?</h2>
          <button onClick={onClose} className="text-faint" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-muted mb-4">
          {place ? `Showing events near ${place.label}.` : 'Find concerts, games and shows near you.'}
          {' '}Your exact location never leaves your phone.
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-3 py-2 rounded-xl mb-3 text-sm" role="alert">{error}</div>
        )}

        <Button onClick={async () => { if (await locateDevice()) onClose(); }} fullWidth size="lg" disabled={busy} icon={<Navigation size={18} />}>
          {busy ? 'Finding you...' : 'Use my current location'}
        </Button>

        <div className="flex items-center my-4 text-xs text-faint">
          <span className="flex-1 h-px bg-line" />
          <span className="px-3">or</span>
          <span className="flex-1 h-px bg-line" />
        </div>

        <CitySearch onFound={onClose} />
      </div>
    </div>
  );
};

export default PlaceSheet;
