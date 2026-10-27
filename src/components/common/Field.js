import React from 'react';

// A labeled text input, with an optional hint under it that screen readers
// read along with the field
const Field = ({ id, label, hint, ...input }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-fg/80 mb-1">{label}</label>
    <input id={id} type="text" className="field" aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
    {hint && <p id={`${id}-hint`} className="text-xs text-faint mt-1">{hint}</p>}
  </div>
);

export default Field;
