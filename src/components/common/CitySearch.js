import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import Button from './Button';
import { usePlace } from '../../hooks/usePlace';

// Look for events around a typed city or ZIP code: for when the phone's
// location isn't available, or to look somewhere else. onFound runs once
// the place is saved.
const CitySearch = ({ onFound = () => {} }) => {
  const { busy, error, searchPlace } = usePlace();
  const [text, setText] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (text.trim().length < 2) return;
    if (await searchPlace(text)) onFound();
  };

  return (
    <>
      {error && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-3 py-2 rounded-xl mb-3 text-sm" role="alert">{error}</div>
      )}
      <form onSubmit={handleSearch} className="flex space-x-2">
        <div className="relative flex-1">
          <MapPin size={18} className="absolute left-3 top-3 text-faint" aria-hidden="true" />
          <input
            aria-label="City or ZIP code"
            className="field pl-9"
            placeholder="City or ZIP code"
            value={text}
            onChange={e => setText(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={busy || text.trim().length < 2}>Search</Button>
      </form>
    </>
  );
};

export default CitySearch;
