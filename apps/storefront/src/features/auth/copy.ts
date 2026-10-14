// Screen copy for SF-10…SF-14 (spec 01 §5). Error messages by code; never the backend's message text.

export const AUTH_COPY = {
  signIn: {
    title: 'Sign in',
    submit: 'Sign in',
    forgotPassword: 'Forgot password?',
    createAccount: 'Create account',
    noAccount: 'New to Nile?',
  },
  register: {
    title: 'Create account',
    submit: 'Create account',
    haveAccount: 'Already have an account?',
    signIn: 'Sign in',
    forgotPassword: 'Forgot password?',
    passwordHint: 'At least 8 characters.',
  },
  verify: {
    title: 'Verify your email',
    sentTo: (email: string) => `We sent a 6-digit code to ${email}. It expires in 10 minutes.`,
    /** Arriving from sign-in: no code was sent yet (backend sends one only on registration). [PROPOSED] */
    requestCode: (email: string) => `Use "Resend code" to get a 6-digit code at ${email}.`,
    submit: 'Verify',
    resend: 'Resend code',
    resendIn: (seconds: number) => `Resend code in ${seconds} s`,
    resent: 'If this email needs verification, a new code is on its way.',
    changeEmail: 'Change email',
  },
  forgot: {
    title: 'Forgot password',
    intro:
      "Enter your account's email. If an active account uses it, we'll send a code to reset the password.",
    submit: 'Send code',
  },
  reset: {
    title: 'Reset password',
    sent: 'If an active account uses this email, we sent a reset code.',
    submit: 'Reset password',
    newCode: 'Send a new code',
    newCodeIn: (seconds: number) => `Send a new code in ${seconds} s`,
  },
  fields: {
    email: 'Email',
    password: 'Password',
    newPassword: 'New password',
    confirmPassword: 'Confirm password',
    confirmNewPassword: 'Confirm new password',
    firstName: 'First name',
    lastName: 'Last name',
    phone: 'Mobile phone',
    code: 'Code',
  },
  notices: {
    'password-reset': 'Your password was changed. Please sign in.',
    'session-ended': 'Your session has ended. Please sign in again.',
    'email-not-verified': 'Please verify your email first.',
  },
  errors: {
    INVALID_CREDENTIALS: 'Email or password is incorrect.',
    ACCOUNT_SUSPENDED: 'This account is suspended.',
    EMAIL_ALREADY_REGISTERED: 'An account with this email already exists.',
    INVALID_OTP: 'This code is invalid or has expired.',
    /** UI-only check [PROPOSED]: the backend never sees the confirmation field. */
    passwordsDiffer: "The passwords don't match.",
  },
  wrongApp: {
    message: (site: string) => `This is a ${site} account. Please use the ${site} site.`,
    link: (site: string) => `Go to the ${site} site`,
  },
} as const;
