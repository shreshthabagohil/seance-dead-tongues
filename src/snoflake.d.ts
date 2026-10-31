declare module 'snoflake' {
  interface SnoflakeSession {
    end(): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  }
  interface SnoflakeOptions {
    source: string;
    stlimit?: number;
    onOutput?: (line: string) => void;
    onError?: (line: string) => void;
    onDone?: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  }
  export function createSession(options: SnoflakeOptions): SnoflakeSession;
}
