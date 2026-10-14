// Public interface of @nile/auth-screens (design 01 R-24): the sign-in screens every app shares. Each app
// wraps its sign-in pages in <AuthScreensProvider> with its routes, sites, API calls and Link.
export { ForgotPasswordForm } from './components/forgot-password-form';
export { ResetPasswordForm, type ResetPasswordFormProps } from './components/reset-password-form';
export { SignInForm, type SignInFormProps } from './components/sign-in-form';
export { VerifyEmailForm, type VerifyEmailFormProps } from './components/verify-email-form';
export { AuthCard } from './components/auth-card';
export { FailureAlert } from './components/failure-alert';
export {
  AuthScreensProvider,
  useAuthScreens,
  withQuery,
  type AuthLinkProps,
  type AuthRoutes,
  type AuthScreensApi,
  type AuthScreensConfig,
  type OtherSite,
  type UserRole,
} from './config';
export { AUTH_COPY } from './copy';
export { RESEND_COOLDOWN_SECONDS } from './constants';
export { confirmationMatches } from './schemas';
export { useSubmitFailure, type SubmitFailure } from './submit-failure';
