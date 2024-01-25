export interface ScrollToLastElementOptions {
  scrollableContainerSelector?: string;
  elementsSelector?: string;
  dataAttributeName?: string;
}

class ScrollPositionResetHandler {
  static readonly lastSelectedItemsCookieKey = 'lastSelectedItems';

  #lastAlbumSelected: string | undefined = undefined;

  constructor() {
    const storedValue = window.localStorage.getItem(ScrollPositionResetHandler.lastSelectedItemsCookieKey);
    if (storedValue === null) {
      return;
    }

    const storedData = JSON.parse(storedValue);
    if (typeof storedData !== 'object' || typeof storedData.lastAlbumSelected !== 'string') {
      return;
    }

    // hydrate properties
    this.#lastAlbumSelected = storedData?.lastAlbumSelected;
  }

  #saveData(): void {
    const dataToSave = {
      lastAlbumSelected: this.#lastAlbumSelected,
    };

    window.sessionStorage.setItem(ScrollPositionResetHandler.lastSelectedItemsCookieKey, JSON.stringify(dataToSave));
  }

  get lastAlbumSelected(): string | undefined {
    return this.#lastAlbumSelected;
  }

  set lastAlbumSelected(albumId: string | undefined) {
    this.#lastAlbumSelected = albumId;
    this.#saveData();
  }

  scrollToLastElement(elementId: string, options: ScrollToLastElementOptions = {}): void {
    const opt: ScrollToLastElementOptions = {
      scrollableContainerSelector: 'div[class^=hmv_contentsContainer]',
      elementsSelector: 'div[class^=hmv_contentCardContainer]',
      dataAttributeName: 'data-id',
      ...options,
    };

    const scrollToElement = document.querySelector(
      `${opt.scrollableContainerSelector} ${opt.elementsSelector}[${opt.dataAttributeName}='${elementId}']`,
    );

    scrollToElement?.scrollIntoView({ behavior: 'smooth' });
  }
}

const singleton = new ScrollPositionResetHandler();

export default singleton;
