import { p } from '../../../../shared/i18n';

// Worker app: home screen, check-in flow, shifts, "Me", and the location, camera and install helpers.
export const worker = {
  nav: {
    home: 'Home',
    shifts: 'Shifts',
    me: 'Me',
  },
  /** Badges used on several worker screens. */
  status: {
    /** {duration} is e.g. "15m". */
    late: '{duration} late',
    waitingForManager: 'Waiting for manager',
    checkedIn: 'Checked in',
    noCheckOut: 'No check-out',
    /** States of a shift. */
    shiftDone: 'Done',
    shiftMissed: 'Missed',
    shiftNow: 'Now',
  },
  /** iPhone only: before the phone is set up, suggest adding the app to the Home Screen. */
  install: {
    title: 'Add the app to your Home Screen',
    intro: 'Then checking in is one tap from your Home Screen. It takes 10 seconds:',
    /** {icon} is the Share icon. */
    step1: 'Tap the {icon} Share button at the bottom of Safari.',
    /** Name of the Share icon for screen readers. */
    share: 'Share',
    /** {icon} is the "add" icon, {action} the menu item (addToHomeScreen) in bold. */
    step2: 'Choose {icon} {action}.',
    /** The menu item as the iPhone names it in this language. */
    addToHomeScreen: 'Add to Home Screen',
    step3: 'Open the app from your Home Screen and sign in there.',
    skip: 'Continue in Safari instead',
  },
  home: {
    onSite: 'On site',
    onSiteAt: 'On site · {site}',
    /** {duration} is the time since checking in ("2h 5m") or "just now". */
    since: 'Since {time} · {duration}',
    notCheckedIn: 'Not checked in',
    checkIn: 'Check in',
    checkOut: 'Check out',
    locationChecked: 'Your location is checked when you tap.',
    locationAndPhotoChecked: 'Your location and a quick photo are checked.',
    nextShift: 'Next shift',
    nonePlanned: 'None planned',
    thisWeek: 'This week',
    shiftsOver: 'Your shifts for today are over.',
    noShiftToday: 'No shift today.',
    shiftStarts: 'Shift starts at {time}.',
    /** {wait} is e.g. "45m". */
    shiftStartsIn: 'Shift starts at {time} (in {wait}).',
    shiftStarted: 'Your shift started at {time}.',
    /** {range} is e.g. "8:00 AM – 4:00 PM". */
    todayShift: 'Today {range}',
    /** Banner when the manager asks the worker to confirm they are at work. */
    presence: {
      title: 'Your manager asks: are you at work?',
      within: p({ one: 'Please confirm within {count} min.', other: 'Please confirm within {count} min.' }),
      confirm: 'Yes, confirm my location',
    },
  },
  /** Setting up and approving this phone. */
  device: {
    settingUp: 'Setting up this phone…',
    onlyOnce: 'This only happens once.',
    pendingTitle: 'Waiting for your manager',
    pendingBody: 'This phone must be approved before you can check in. You will be able to check in as soon as your manager approves it.',
    revokedTitle: 'This phone was removed from your account',
    rejectedTitle: 'Your manager did not approve this phone',
    askBody: 'To check in from this phone, ask your manager to approve it again.',
    askPlaceholder: 'Message for your manager (for example: I have a new phone)',
    ask: 'Ask to use this phone',
    conflictTitle: 'This phone belongs to another worker',
    conflictBody: 'Every worker must check in with their own phone. Your manager has been told about this sign-in.',
    unsupportedTitle: 'This browser is not supported',
    unsupportedBody: 'Please open the app in Safari (iPhone) or Chrome (Android).',
    failedTitle: 'Phone setup failed',
    failedBody: 'Please try again.',
    noKey: 'This phone has no device key yet.',
  },
  /** The full-screen check-in / check-out / "I'm at work" flow. */
  punch: {
    title: {
      in: 'Check in',
      out: 'Check out',
      presence: 'Confirm you’re at work',
    },
    failed: {
      in: 'Could not check in',
      out: 'Could not check out',
      presence: 'Could not confirm you’re at work',
    },
    notSetUp: 'This phone is not set up yet.',
    locationProblem: 'Location problem',
    cameraProblem: 'Camera problem',
    statusChanged: 'Your status changed',
    tooSlowTitle: 'That took too long',
    tooSlowBody: 'Please try again — it only takes a few seconds.',
    requestFailed: 'Could not send the request',
    tooDark: 'The photo is too dark. Face a light and make sure nothing covers the camera.',
    yourPhoto: 'Your photo',
    takeQuickPhoto: 'Take a quick photo',
    faceVisible: 'Make sure your face is clearly visible.',
    sending: 'Sending…',
    checkingLocationAndPhoto: 'Checking your location and photo',
    almostDone: 'Almost done…',
    waitingForLocation: 'Waiting for your location',
    takePhoto: 'Take photo',
    startingCamera: 'Starting camera',
    verifying: 'Verifying…',
    findingYourLocation: 'Finding your location…',
    /** {distance} is e.g. "12 m". */
    accurateTo: 'Accurate to {distance}',
    keepOpen: 'Keep the app open',
    locationFound: 'Location found',
    locationFoundAccuracy: 'Location found · ±{distance}',
    locating: 'Locating · ±{distance}',
    findingLocation: 'Finding location…',
    presenceConfirmed: 'You’re confirmed at work',
    presenceNotConfirmed: 'Not confirmed',
    notCheckedIn: 'Not checked in',
    notCheckedOut: 'Not checked out',
    away: '{distance} away',
    awayFrom: '{distance} away from {site}',
    askManager: 'Ask manager to accept',
    checkedIn: 'Checked in',
    checkedOut: 'Checked out',
    worked: 'Worked {duration}',
    /** After a refusal: send the check-in to the manager as a request. */
    request: {
      title: 'Ask your manager',
      bodyIn: 'Your manager will see where you are and decide. Explain why you are checking in from here.',
      bodyOut: 'Your manager will see where you are and decide. Explain why you are checking out from here.',
      placeholder: 'For example: working at the customer’s house today',
      send: 'Send to manager',
    },
  },
  shifts: {
    title: 'My shifts',
    upcoming: 'Upcoming',
    worked: 'Worked',
    noUpcomingTitle: 'No upcoming shifts',
    noUpcomingBody: 'When your manager plans your shifts, they show up here.',
    noHistoryTitle: 'Nothing yet',
    noHistoryBody: 'Your check-ins of the last 30 days will show up here.',
    last30Days: 'Last 30 days',
    inProgress: 'In progress',
    /** End of a check-in that never got a check-out: "8:34 AM → ?". */
    noEnd: '?',
  },
  me: {
    title: 'Me',
    phoneNumber: 'Phone number',
    thisPhone: 'This phone',
    approved: 'Approved',
    waitingForApproval: 'Waiting for approval',
    notApproved: 'Not approved',
    notifications: 'Get a message when your manager asks you to confirm you are at work.',
    install: 'Install the app',
    changePassword: 'Change password',
    passwordChanged: 'Password changed',
    locationPrivacy:
      'Your location is only checked when you check in or out, or when your manager asks you to confirm. It is not tracked in the background.',
    phonePrivacy: 'Check-ins only work from this phone. Do not share your password — your manager sees every sign-in from another phone.',
    /** e.g. "OnSite v1.4.0". */
    appVersion: '{app} v{version}',
  },
  /** Why the phone's location could not be read. */
  geo: {
    unsupported: {
      title: 'Location is not available',
      body: 'This browser cannot share your location. Open the app in Chrome or Safari on your phone.',
    },
    insecure: {
      title: 'Secure connection needed',
      body: 'Location only works over a secure (https) connection. Ask your manager for the correct address.',
    },
    denied: {
      title: 'Location is blocked',
      body: 'Allow location for this app: open your phone Settings → Privacy / Location → your browser, choose "While using" and turn on Precise Location. Then try again.',
    },
    unavailable: {
      title: 'Can’t find your location',
      body: 'Turn on Location (GPS) on your phone, step outside or near a window, and try again.',
    },
    timeout: {
      title: 'Location took too long',
      body: 'Your phone did not report a location in time. Make sure Location is on and try again.',
    },
  },
  /** Why the camera could not be used for the check-in photo. */
  camera: {
    unsupported: {
      title: 'Camera not available',
      body: 'This browser cannot use the camera. Open the app in Chrome or Safari on your phone.',
    },
    denied: {
      title: 'Camera is blocked',
      body: 'A quick photo is needed to check in. Allow the camera for this app in your phone Settings, then try again.',
    },
    unavailable: {
      title: 'Camera did not start',
      body: 'Close other apps that use the camera and try again.',
    },
  },
};
