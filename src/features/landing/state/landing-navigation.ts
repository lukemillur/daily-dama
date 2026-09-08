/**
 * Signal contract between the root landing route (`/`) and T112.6's in-app
 * "exit to landing" link.
 *
 * `useRedirectOnboardedVisitorHome` (see redirect-onboarded-visitor-home.ts)
 * redirects a fully-onboarded, fresh arrival at `/` straight to `/app/home`.
 * T112.6's link is the one deliberate exception: it navigates back to `/`
 * from inside the app and must set this param so that redirect is skipped,
 * letting an already-onboarded visitor see the landing page again.
 *
 * Contract:
 *   router.push({ pathname: '/', params: { [LANDING_ARRIVAL_PARAM]: LANDING_ARRIVAL_FROM_APP } })
 *
 * - `LANDING_ARRIVAL_PARAM` ('from') is read on `/` via useLocalSearchParams.
 * - `LANDING_ARRIVAL_FROM_APP` ('app') is the only value that counts as an
 *   in-app arrival; any other value (or the param's absence) is treated as a
 *   fresh arrival and triggers the redirect when onboarding is complete.
 */
export const LANDING_ARRIVAL_PARAM = 'from';
export const LANDING_ARRIVAL_FROM_APP = 'app';
