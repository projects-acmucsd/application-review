/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_BASE_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_REDIRECT_URI?: string;
  readonly VITE_REVIEWER_LIST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface GoogleUserInfo {
  email?: string;
  name?: string;
  picture?: string;
}

interface GoogleApiClient {
  init: (args: { discoveryDocs?: string[] }) => Promise<void>;
  load: (nameOrUrl: string, version?: string) => Promise<void>;
  setToken: (token: { access_token: string } | null) => void;
  sheets: {
    spreadsheets: {
      values: {
        get: (args: {
          spreadsheetId: string;
          range: string;
        }) => Promise<{ result: { values?: string[][] } }>;
        update: (args: {
          spreadsheetId: string;
          range: string;
          valueInputOption: string;
          resource: { values: string[][] };
        }) => Promise<unknown>;
      };
    };
  };
}

interface GoogleApi {
  load: (libraries: string, callback: () => void) => void;
  client: GoogleApiClient;
}

interface Window {
  gapi?: GoogleApi;
}
