import { fillPromptTemplate } from './prompt-template.js';

describe('fillPromptTemplate', () => {
  it('fills every occurrence of each placeholder', () => {
    expect(
      fillPromptTemplate('Router', 'Towns: {{towns}}. Again: {{towns}}. Bands: {{bands}}.', {
        towns: () => 'Ellon, Huntly',
        bands: () => 'A to H',
      }),
    ).toBe('Towns: Ellon, Huntly. Again: Ellon, Huntly. Bands: A to H.');
  });

  it('refuses a template missing a placeholder, naming the prompt', () => {
    expect(() =>
      fillPromptTemplate('Router', '{{towns}} only', {
        towns: () => 'Ellon',
        bands: () => 'A',
      }),
    ).toThrow('Router prompt template has no {{bands}}');
  });

  it('refuses a template with a placeholder nobody fills', () => {
    expect(() =>
      fillPromptTemplate('Router', '{{towns}} {{examples}}', { towns: () => 'Ellon' }),
    ).toThrow('Router prompt template has an unknown placeholder {{examples}}');
  });
});
