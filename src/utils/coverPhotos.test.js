import { COVER_PHOTOS, coverPhotoFor, coverPhotoUrl } from './coverPhotos';

describe('cover photos', () => {
  // The server hands out coverIndex 0-9 (COVER_PHOTOS_PER_TYPE), so every
  // type needs exactly 10 photos, and each photo should appear only once
  it('has 10 different photos for every event type', () => {
    const types = ['music-festival', 'concert', 'outdoor', 'group-travel', 'sports', 'arts'];
    expect(Object.keys(COVER_PHOTOS).sort()).toEqual([...types].sort());
    for (const type of types) expect(COVER_PHOTOS[type]).toHaveLength(10);

    const all = Object.values(COVER_PHOTOS).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it("shows the event's numbered photo for its type", () => {
    expect(coverPhotoFor({ type: 'sports', coverIndex: 2 })).toBe(COVER_PHOTOS.sports[2]);
  });

  it('starts with the first photo when there is no number, and festival photos for an unknown type', () => {
    expect(coverPhotoFor({ type: 'arts' })).toBe(COVER_PHOTOS.arts[0]);
    expect(coverPhotoFor({ type: 'rave', coverIndex: 1 })).toBe(COVER_PHOTOS['music-festival'][1]);
  });

  it('asks the CDN for twice the drawn width', () => {
    expect(coverPhotoUrl('123-abc', 80)).toBe('https://images.unsplash.com/photo-123-abc?w=160&q=70&auto=format&fit=crop');
  });
});
