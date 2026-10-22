// Sign-in, two-step code and password screens.
export const auth = {
  signIn: {
    title: 'Sign in',
    subtitle: 'Use the username and password you were given.',
    username: 'Username',
    password: 'Password',
    submit: 'Sign in',
    forgot: 'Forgot your password? Ask your manager to reset it.',
  },
  code: {
    title: 'Two-step sign-in',
    subtitle: 'Enter the 6-digit code from your authenticator app.',
    label: 'Verification code',
    verify: 'Verify',
    otherAccount: 'Use another account',
  },
  changePassword: {
    current: 'Current password',
    new: 'New password',
    newHint: 'At least 8 characters. A short sentence is easy to remember.',
    repeat: 'Repeat new password',
    mismatch: 'The passwords do not match.',
    submit: 'Save new password',
  },
  forceChange: {
    title: 'Choose your password',
    subtitle: 'Replace the temporary password with one only you know.',
    submit: 'Save and continue',
    signOut: 'Sign out',
  },
};
