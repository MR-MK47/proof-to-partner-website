interface ImportMetaEnv { readonly PUBLIC_SITE_URL?: string; }
interface ImportMeta { readonly env: ImportMetaEnv; }
declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        'expired-callback'?: () => void;
        'error-callback'?: () => void;
        theme?: 'light' | 'dark' | 'auto';
      }) => string;
      reset: (widgetId?: string) => void;
    };
  }
}
export {};