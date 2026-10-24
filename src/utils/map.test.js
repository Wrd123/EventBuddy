import { groupByVenue, listNames } from './map';

const show = (id, venue, lat, lng, startDate, startTime = '') => ({ _id: id, venue, lat, lng, startDate, startTime });

describe('groupByVenue', () => {
  it('gives each venue one pin, with its events soonest first', () => {
    const venues = groupByVenue([
      show('late', 'Arena', 33.75731, -84.39631, '2099-11-22', '19:00'),
      show('fox', 'Fox Theatre', 33.7725, -84.3857, '2099-11-21'),
      // The same building, listed a few meters apart
      show('early', 'Arena', 33.75729, -84.39629, '2099-11-20', '19:30'),
      show('sameDayNoTime', 'Arena', 33.7573, -84.3963, '2099-11-20')
    ]);

    expect(venues.map(v => [v.venue, v.events.map(e => e._id)])).toEqual([
      ['Arena', ['early', 'sameDayNoTime', 'late']],
      ['Fox Theatre', ['fox']]
    ]);
  });

  it('leaves out events without a position', () => {
    expect(groupByVenue([show('x', 'Somewhere', null, null, '2099-11-20')])).toEqual([]);
  });
});

describe('listNames', () => {
  it('reads naturally for any number of names', () => {
    expect(listNames(['Hiking Trip'])).toBe('Hiking Trip');
    expect(listNames(['Hiking Trip', 'Game Night'])).toBe('Hiking Trip and Game Night');
    expect(listNames(['A', 'B', 'C'])).toBe('A, B and C');
    expect(listNames(['A', 'B', 'C', 'D'])).toBe('A, B and 2 more');
  });
});
