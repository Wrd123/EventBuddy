import { describeActivity, emptyFeed, clearFeed, mergeNewest, appendOlder } from './activity';

const ME = 'u1';
const alex = { user: 'u2', name: 'Alex' };
const taylor = { user: 'u3', name: 'Taylor' };
const john = { user: ME, name: 'John Doe' };

describe('describeActivity', () => {
  const say = (actor, kind, data) => describeActivity({ actor, kind, data }, ME);

  it('says who did what, with "You" for your own lines', () => {
    expect(say(alex, 'joined')).toBe('Alex joined');
    expect(say(john, 'joined')).toBe('You joined');
    expect(say(taylor, 'left')).toBe('Taylor left');
    expect(say(alex, 'schedule_added', { activity: 'Frisbee' })).toBe('Alex added Frisbee to the schedule');
    expect(say(john, 'expense_added', { description: 'Snacks & drinks', amountCents: 4860 }))
      .toBe('You added Snacks & drinks ($48.60)');
    expect(say(taylor, 'meetup_set')).toBe('Taylor set the meetup point');
    expect(say(alex, 'sharing_started')).toBe('Alex started sharing their location');
    expect(say(john, 'sharing_started')).toBe('You started sharing your location');
  });

  it('says a payment was recorded, and by which side', () => {
    const payment = (from, to) => ({ from, to, amountCents: 8000 });
    expect(say(alex, 'payment_marked', payment(alex, john))).toBe('Alex recorded a payment of $80.00 to you');
    expect(say(taylor, 'payment_marked', payment(alex, taylor))).toBe('Taylor recorded a payment of $80.00 from Alex');
    expect(say(john, 'payment_marked', payment(john, taylor))).toBe('You recorded a payment of $80.00 to Taylor');
    expect(say(john, 'payment_marked', payment(alex, john))).toBe('You recorded a payment of $80.00 from Alex');
  });

  it('names the details an edit changed, with both dates as one', () => {
    expect(say(taylor, 'event_updated', { fields: ['location'] })).toBe('Taylor changed the place');
    expect(say(taylor, 'event_updated', { fields: ['startDate', 'endDate'] })).toBe('Taylor changed the dates');
    expect(say(taylor, 'event_updated', { fields: ['name', 'startDate', 'location', 'budgetCents'] }))
      .toBe('Taylor changed the name, dates, place and budget');
    expect(say(taylor, 'event_updated', {})).toBe('Taylor updated the event');
  });

  it('copes with a line it has no words for, or no details', () => {
    expect(describeActivity({ actor: alex, kind: 'something_new' }, ME)).toBe('Alex updated the event');
    expect(describeActivity({ actor: alex, kind: 'joined' }, ME)).toBe('Alex joined');
  });
});

// Lines with ids that sort like real ones: line(5) is newer than line(4)
const line = (n) => ({ _id: `a${String(n).padStart(4, '0')}` });
// Lines from..to, newest first, as the server sends them
const lines = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => line(to - i));
const ids = (feed) => feed.items.map((l) => l._id);
const page = (from, to, hasMore) => ({ activity: lines(from, to), hasMore });

describe('mergeNewest', () => {
  it('takes the first page as it is', () => {
    const feed = mergeNewest(emptyFeed, page(11, 30, true));
    expect(ids(feed)).toEqual(ids({ items: lines(11, 30) }));
    expect(feed.hasMore).toBe(true);
  });

  it('adds new lines on top of what was loaded', () => {
    const feed = mergeNewest(mergeNewest(emptyFeed, page(11, 30, true)), page(13, 32, true));
    expect(ids(feed)).toEqual(ids({ items: lines(11, 32) }));
    expect(feed.hasMore).toBe(true);
  });

  it("keeps knowing there's nothing older once the whole history is loaded", () => {
    let feed = mergeNewest(emptyFeed, page(6, 25, true));
    feed = appendOlder(feed, page(1, 5, false), feed.gen);
    expect(feed.hasMore).toBe(false);

    // A new line: the newest page has more after it, but the list doesn't
    feed = mergeNewest(feed, page(7, 26, true));
    expect(ids(feed)).toEqual(ids({ items: lines(1, 26) }));
    expect(feed.hasMore).toBe(false);
  });

  it('drops a line that was taken back within the newest page', () => {
    let feed = mergeNewest(emptyFeed, page(11, 30, true));
    feed = mergeNewest(feed, { activity: lines(11, 30).filter((l) => l._id !== line(25)._id), hasMore: true });
    expect(ids(feed)).not.toContain(line(25)._id);
    expect(feed.items).toHaveLength(19);
  });

  it('replaces the list when more than a page arrived while away, leaving no gap', () => {
    let feed = mergeNewest(emptyFeed, page(11, 30, true));
    feed = mergeNewest(feed, page(36, 55, true));
    expect(ids(feed)).toEqual(ids({ items: lines(36, 55) }));
    expect(feed.hasMore).toBe(true);
  });

  it('takes a complete page as all there is', () => {
    let feed = mergeNewest(emptyFeed, page(1, 3, false));
    feed = mergeNewest(feed, { activity: [line(3), line(1)], hasMore: false });
    expect(ids(feed)).toEqual([line(3)._id, line(1)._id]);
    expect(mergeNewest(feed, { activity: [], hasMore: false }).items).toEqual([]);
  });
});

describe('appendOlder', () => {
  it('adds an older page below, without repeating a line', () => {
    let feed = mergeNewest(emptyFeed, page(21, 40, true));
    feed = appendOlder(feed, page(5, 21, true), feed.gen);
    expect(ids(feed)).toEqual(ids({ items: lines(5, 40) }));
    expect(feed.hasMore).toBe(true);
  });

  it("ignores a page asked for before the list was replaced", () => {
    let feed = mergeNewest(emptyFeed, page(11, 30, true));
    const askedAt = feed.gen;
    feed = mergeNewest(feed, page(36, 55, true));

    const after = appendOlder(feed, page(1, 10, false), askedAt);
    expect(after).toBe(feed);
    expect(after.hasMore).toBe(true);
  });

  it('ignores a page asked for before the event was lost', () => {
    let feed = mergeNewest(emptyFeed, page(11, 30, true));
    const askedAt = feed.gen;
    feed = clearFeed(feed);
    expect(appendOlder(feed, page(1, 10, false), askedAt).items).toEqual([]);
  });
});
