import { styled } from 'styled-components/native';

import { AppColors } from '@/constants/theme';

/**
 * Constrains a `TrickDirectory` (or similar directory-shaped content) to the
 * same 760px column width used by the Tricks tab's `DirectoryContent`
 * wrapper, and centers it within a wider parent.
 *
 * Kept as a standalone component (rather than reusing the Tricks tab's own
 * `DirectoryContent`) so routes such as Trick Goals can pick it up without
 * touching `src/app/tricks/index.tsx`.
 */
export const TrickDirectoryColumn = styled.View`
  width: 100%;
  max-width: 760px;
  align-self: center;
  flex: 1;
  overflow: hidden;
  background-color: ${AppColors.paper};
`;
