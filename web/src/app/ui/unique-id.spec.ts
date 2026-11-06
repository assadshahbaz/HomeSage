import { uniqueId } from './unique-id';

describe('uniqueId', () => {
  it('never repeats, even for the same prefix', () => {
    const ids = Array.from({ length: 50 }, () => uniqueId('field'));

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives a value usable as an id and in a CSS selector', () => {
    const id = uniqueId('drawer-heading');

    expect(id).toMatch(/^[a-z][\w-]*$/);
    document.body.innerHTML = `<p id="${id}"></p>`;
    expect(document.querySelector(`#${id}`)).not.toBeNull();
  });
});
