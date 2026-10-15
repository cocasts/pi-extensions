import { describe, expect, it } from 'vitest';
import changelog from '../scripts/changelog.mjs';

describe('changeset changelog formatter', () => {
  it('formats release summaries without commit hashes', () => {
    expect(
      changelog.getReleaseLine({
        id: 'silver-pigs-bow',
        commit: '1f5597d1234567890',
        summary: 'Organize the extension resource layout.\nKeep resource entry points explicit.',
        releases: [{ name: '@cocasts/pi-image-view', type: 'patch' }],
      }),
    ).toBe('- Organize the extension resource layout.\n  Keep resource entry points explicit.');
  });

  it('formats dependency updates without commit hashes', () => {
    expect(
      changelog.getDependencyReleaseLine(
        [{ id: 'silver-pigs-bow', commit: '1f5597d1234567890', summary: '', releases: [] }],
        [
          { name: '@example/first', newVersion: '1.2.3' },
          { name: '@example/second', newVersion: '4.5.6' },
        ],
      ),
    ).toBe('- Updated dependencies\n  - @example/first@1.2.3\n  - @example/second@4.5.6');
  });

  it('omits empty dependency updates', () => {
    expect(changelog.getDependencyReleaseLine([], [])).toBe('');
  });
});
