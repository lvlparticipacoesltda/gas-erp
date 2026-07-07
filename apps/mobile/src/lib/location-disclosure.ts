export type LocationDisclosureKind = 'foreground' | 'background';

type Presenter = (request: {
  kind: LocationDisclosureKind;
  resolve: (accepted: boolean) => void;
}) => void;

let presenter: Presenter | null = null;

export function registerLocationDisclosurePresenter(next: Presenter | null): void {
  presenter = next;
}

/** Exibe divulgação destacada e aguarda consentimento antes do prompt do sistema. */
export function showLocationDisclosure(kind: LocationDisclosureKind): Promise<boolean> {
  return new Promise((resolve) => {
    if (!presenter) {
      resolve(false);
      return;
    }
    presenter({ kind, resolve });
  });
}
