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
      container: 'div[class^="hmv_titleArea"]',
      titleText: 'a[class^="hmv_title_"]',
      titleTextMobile: 'a[class*="hmv_titleMobile_"]',
    },
    user: {
      userHeaderContainer: 'div[class^="hmv_userHeaderContainer"]',
      userName: 'span[class^="hmv_userName"]',
      logoutButton: 'div[class^="hmv_userHeaderContainer"] button',
    },
    menu: {
      container: 'div[class^="hmv_mainMenu"]',
      toggle: 'div[class^="hmv_mainMenuToggle"]',
      elementsContainer: 'div[class^="hmv_mainMenuElements"]',
      elements: 'div[class^="hmv_linkItem"]',
    },
    navigation: {
      container: 'div[class^="hmv_navigationBar"]',
      navigationBarElements: 'div[class^="hmv_navigationBar"] select, div[class^="hmv_navigationBar"], a',
    },
  },
  contents: {
    container: 'div[class^="hmv_contentsContainer"]',
    card: 'div[class^="hmv_contentCardContainer"]',
    cardName: 'div[class^="hmv_contentName"]',
  },
};
