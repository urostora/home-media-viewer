export const selectors = {
  general: {
    errorMessage: 'div[class*="errorMessage"]',
  },
  login: {
    emailInput: 'input[type="text"][name="email"]',
    passwordInput: 'input[type="password"][name="password"]',
    loginSubmitButton: 'input[type="submit"]',
  },
  main: {
    title: {
      container: '[data-testid="title-area"]',
      titleText: 'a',
      titleTextMobile: 'a',
    },
    user: {
      userHeaderContainer: '[data-testid="user-header"]',
      userName: '[data-testid="user-name"]',
      logoutButton: '[data-testid="user-header"] button:not([role="switch"])',
    },
    menu: {
      container: '[data-testid="main-menu"]',
      toggle: 'button[aria-controls]',
      elementsContainer: '[data-testid="menu-links"]',
      elements: 'a',
    },
    navigation: {
      container: 'div[class^="hmv_navigationBar"]',
      navigationBarElements: 'div[class^="hmv_navigationBar"] select, div[class^="hmv_navigationBar"], a',
    },
  },
  contents: {
    container: '[data-testid="content-list"]',
    card: '[data-testid="content-card"]',
    cardName: '[data-testid="card-name"]',
  },
};
